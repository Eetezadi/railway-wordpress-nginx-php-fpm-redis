let getTokenFn = null;

export function setGetToken(fn) {
  getTokenFn = fn;
}

async function apiFetch(path, options = {}) {
  const token = getTokenFn ? await getTokenFn() : null;
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listSites: () => apiFetch('/sites'),
  getSite: (id) => apiFetch(`/sites/${id}`),
  getSiteStatus: (id) => apiFetch(`/sites/${id}/status`),
  getSiteUsers: (id) => apiFetch(`/sites/${id}/users`),
  createSite: (name) => apiFetch('/sites', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteSite: (id) => apiFetch(`/sites/${id}`, { method: 'DELETE' }),
  purgeSites: () => apiFetch('/sites/purge', { method: 'DELETE' }),
  resetPassword: (siteId, data) =>
    apiFetch(`/passwords/${siteId}/reset`, { method: 'POST', body: JSON.stringify(data) }),
  listBackups: (siteId) => apiFetch(`/sites/${siteId}/backups`),
  restoreSite: (siteId, source, date) =>
    apiFetch(`/sites/${siteId}/restore`, { method: 'POST', body: JSON.stringify({ source, date }) }),
};
