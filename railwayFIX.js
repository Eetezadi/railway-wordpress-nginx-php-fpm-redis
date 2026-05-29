import config from '../config.js';

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2';

async function gql(query, variables = {}) {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.RAILWAY_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Railway HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.errors) {
    const msg = json.errors.map(e => e.message).join(', ');
    console.error('Railway API error:', JSON.stringify({
      query: query.trim().split('\n')[0],
      variables,
      errors: json.errors,
    }));
    throw new Error(`Railway API: ${msg}`);
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

let cachedEnvId;

export async function getEnvironmentId() {
  if (cachedEnvId) return cachedEnvId;

  if (config.RAILWAY_ENVIRONMENT_ID) {
    cachedEnvId = config.RAILWAY_ENVIRONMENT_ID;
    return cachedEnvId;
  }

  const data = await gql(`
    query ($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges { node { id name } }
        }
      }
    }
  `, { projectId: config.RAILWAY_PROJECT_ID });

  const envs = data.project.environments.edges;
  if (!envs.length) throw new Error('No environments found in Railway project');

  const prod = envs.find(e => e.node.name === 'production') || envs[0];
  cachedEnvId = prod.node.id;
  return cachedEnvId;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createService(name) {
  const data = await gql(`
    mutation ($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }
  `, {
    input: {
      projectId: config.RAILWAY_PROJECT_ID,
      name,
    },
  });

  const serviceId = data.serviceCreate.id;

  // Connect GitHub repo if configured
  if (config.RAILWAY_WP_REPO) {
    await gql(`
      mutation ($id: String!, $input: ServiceConnectInput!) {
        serviceConnect(id: $id, input: $input) { id }
      }
    `, {
      id: serviceId,
      input: {
        repo: config.RAILWAY_WP_REPO,
        branch: 'main',
      },
    });

    // Set root directory so Railway picks up the right Dockerfile
    const environmentId = await getEnvironmentId();
    await gql(`
      mutation ($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
      }
    `, {
      serviceId,
      environmentId,
      input: { rootDirectory: '/' },
    });
  }

  return data.serviceCreate;
}

export async function deleteService(serviceId) {
  await gql(`
    mutation ($serviceId: String!) {
      serviceDelete(id: $serviceId)
    }
  `, { serviceId });
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export async function setServiceVariables(serviceId, variables) {
  const environmentId = await getEnvironmentId();
  await gql(`
    mutation ($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `, {
    input: {
      projectId: config.RAILWAY_PROJECT_ID,
      serviceId,
      environmentId,
      variables,
    },
  });
}

// ---------------------------------------------------------------------------
// Volume
// Fix: Railway's volumeCreate API requires a separate two-step process:
// 1. Create the volume attached to the project
// 2. Attach it to the service instance
// Passing serviceId directly inside VolumeCreateInput causes "Problem processing request"
// ---------------------------------------------------------------------------

export async function createVolume(serviceId, name, mountPath) {
  const environmentId = await getEnvironmentId();

  // Step 1: Create the volume at the project level
  const data = await gql(`
    mutation ($input: VolumeCreateInput!) {
      volumeCreate(input: $input) { id name }
    }
  `, {
    input: {
      projectId: config.RAILWAY_PROJECT_ID,
      environmentId,
      mountPath,
      name,
    },
  });

  const volumeId = data.volumeCreate.id;

  // Step 2: Attach the volume to the service instance
  await gql(`
    mutation ($input: VolumeInstanceUpdateInput!) {
      volumeInstanceUpdate(input: $input)
    }
  `, {
    input: {
      volumeId,
      serviceId,
      environmentId,
      mountPath,
    },
  });

  return data.volumeCreate;
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

export async function getServiceDomain(serviceId) {
  const environmentId = await getEnvironmentId();
  const data = await gql(`
    mutation ($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }
  `, {
    input: { serviceId, environmentId },
  });
  return data.serviceDomainCreate.domain;
}

// ---------------------------------------------------------------------------
// Deployments
// ---------------------------------------------------------------------------

export async function triggerDeploy(serviceId) {
  const environmentId = await getEnvironmentId();
  await gql(`
    mutation ($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `, { serviceId, environmentId });
}

export async function getServiceStatus(serviceId) {
  const data = await gql(`
    query ($serviceId: String!) {
      service(id: $serviceId) {
        deployments(first: 1, orderBy: { createdAt: DESC }) {
          edges { node { id status } }
        }
      }
    }
  `, { serviceId });

  const edges = data.service.deployments.edges;
  if (!edges.length) return 'no_deployments';
  return edges[0].node.status;
}

// ---------------------------------------------------------------------------
// High-level deploy orchestration
// ---------------------------------------------------------------------------

export async function deployService(serviceId, { dbName, redisPrefix, siteName }) {
  // 1. Set environment variables
  await setServiceVariables(serviceId, {
    WORDPRESS_DB_HOST:     config.MYSQL_HOST,
    WORDPRESS_DB_PORT:     String(config.MYSQL_PORT),
    WORDPRESS_DB_USER:     config.MYSQL_USER,
    WORDPRESS_DB_PASSWORD: config.MYSQL_PASSWORD,
    WORDPRESS_DB_NAME:     dbName,
    REDIS_HOST:            process.env.REDIS_HOST     || '',
    REDIS_PORT:            process.env.REDIS_PORT     || '6379',
    REDIS_PASSWORD:        process.env.REDIS_PASSWORD || '',
    WP_REDIS_PREFIX:       redisPrefix,
  });

  // 2. Create and attach persistent volume for WordPress files
  await createVolume(serviceId, `${siteName}-volume`, '/var/www/html');

  // 3. Generate a public domain for this service
  const domain = await getServiceDomain(serviceId);

  // 4. Trigger an actual deployment now that config is in place
  await triggerDeploy(serviceId);

  return { domain };
}
