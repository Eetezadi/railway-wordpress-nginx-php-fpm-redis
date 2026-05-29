import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config.js';

const s3 = new S3Client({
  region: config.AWS_DEFAULT_REGION,
  endpoint: config.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * List all backup sources (top-level prefixes) in the bucket.
 * @returns {Promise<string[]>}
 */
export async function listBackupSources() {
  const cmd = new ListObjectsV2Command({
    Bucket: config.AWS_S3_BUCKET_NAME,
    Delimiter: '/',
  });
  const res = await s3.send(cmd);
  return (res.CommonPrefixes || []).map((p) => p.Prefix.replace(/\/$/, '')).sort();
}

/**
 * List available backup dates for a site slug.
 * Returns date strings sorted descending (newest first).
 * @param {string} siteSlug
 * @returns {Promise<string[]>}
 */
export async function listBackupDates(siteSlug) {
  const prefix = `${siteSlug}/`;
  const cmd = new ListObjectsV2Command({
    Bucket: config.AWS_S3_BUCKET_NAME,
    Prefix: prefix,
    Delimiter: '/',
  });
  const res = await s3.send(cmd);
  const prefixes = (res.CommonPrefixes || []).map((p) => {
    // Strip the siteSlug/ prefix and trailing slash to get date string
    return p.Prefix.replace(prefix, '').replace(/\/$/, '');
  });
  return prefixes.sort().reverse();
}

/**
 * List files within a specific backup date folder.
 * @param {string} siteSlug
 * @param {string} date
 * @returns {Promise<Array<{ key: string, size: number, lastModified: Date }>>}
 */
export async function listBackupFiles(siteSlug, date) {
  const prefix = `${siteSlug}/${date}/`;
  const cmd = new ListObjectsV2Command({
    Bucket: config.AWS_S3_BUCKET_NAME,
    Prefix: prefix,
  });
  const res = await s3.send(cmd);
  return (res.Contents || []).map((obj) => ({
    key: obj.Key,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
}

/**
 * Get a readable stream for an S3 object.
 * @param {string} key  Full S3 key
 * @returns {Promise<NodeJS.ReadableStream>}
 */
export async function getBackupStream(key) {
  const cmd = new GetObjectCommand({
    Bucket: config.AWS_S3_BUCKET_NAME,
    Key: key,
  });
  const res = await s3.send(cmd);
  return res.Body;
}

/**
 * Get a presigned URL for an S3 object (valid 1 hour).
 * @param {string} key  Full S3 key
 * @returns {Promise<string>}
 */
export async function getPresignedUrl(key) {
  const cmd = new GetObjectCommand({
    Bucket: config.AWS_S3_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(s3, cmd, { expiresIn: 3600 });
}
