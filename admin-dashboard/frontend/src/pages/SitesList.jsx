import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { api, setGetToken } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const FILTERS = [
  { key: 'all', label: 'All Sites' },
  { key: 'active', label: 'Active' },
  { key: 'provisioning', label: 'Provisioning' },
  { key: 'error', label: 'Errors' },
];

export default function SitesList() {
  const { getToken, isLoaded } = useAuth();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [purging, setPurging] = useState(false);
  const [filter, setFilter] = useState('all');
  const pollRef = useRef(null);

  useEffect(() => {
    setGetToken(getToken);
    if (isLoaded) loadSites();
    return () => clearInterval(pollRef.current);
  }, [getToken, isLoaded]);

  async function loadSites() {
    try {
      const data = await api.listSites();
      setSites(data);
      const hasProvisioning = data.some(s => s.status === 'provisioning');
      if (hasProvisioning && !pollRef.current) {
        pollRef.current = setInterval(async () => {
          try {
            const fresh = await api.listSites();
            setSites(fresh);
            if (!fresh.some(s => s.status === 'provisioning')) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } catch {}
        }, 5000);
      } else if (!hasProvisioning && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e, site) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${site.name}"? This will remove the Railway service and mark the site as deleted.`)) return;
    setDeleting(site.id);
    setError('');
    setSuccess('');
    try {
      await api.deleteSite(site.id);
      setSuccess(`"${site.name}" has been deleted.`);
      await loadSites();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handlePurge() {
    if (!confirm('Purge all deleted sites from the database? This frees up their slugs for reuse.')) return;
    setPurging(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.purgeSites();
      setSuccess(`Purged ${result.purged} deleted site(s).`);
      await loadSites();
    } catch (err) {
      setError(err.message);
    } finally {
      setPurging(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.createSite(newName.trim());
      setSuccess(`"${result.name}" is being provisioned at ${result.domain}`);
      setNewName('');
      await loadSites();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  const counts = {};
  for (const opt of FILTERS) {
    counts[opt.key] = opt.key === 'all' ? sites.length : sites.filter(s => s.status === opt.key).length;
  }

  const filteredSites = filter === 'all' ? sites : sites.filter(s => s.status === filter);

  return (
    <div>
      <div className="page-header">
        <h1>Your Sites</h1>
        <div className="page-header-actions">
          <button className="btn btn-ghost btn-sm" onClick={handlePurge} disabled={purging}>
            {purging ? 'Purging...' : 'Purge Deleted'}
          </button>
        </div>
      </div>

      {/* Stat bar / filter */}
      <div className="stat-bar">
        {FILTERS.map((opt) => (
          <div
            key={opt.key}
            className={`stat-item ${filter === opt.key ? 'active' : ''}`}
            onClick={() => setFilter(opt.key)}
          >
            <div className="stat-number">{counts[opt.key]}</div>
            <div className="stat-label">{opt.label}</div>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="create-section">
        <form className="create-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Enter a name for your new site..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            className="input"
          />
          <button type="submit" disabled={creating || !newName.trim()} className="btn btn-primary">
            {creating ? (
              <>
                <span className="spinner-inline" />
                Creating...
              </>
            ) : (
              'Deploy Site'
            )}
          </button>
        </form>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading">
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          Loading sites...
        </div>
      ) : sites.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">◇</div>
          <p>No WordPress sites yet</p>
          <p className="muted">Deploy your first site above to get started.</p>
        </div>
      ) : (
        <div className="sites-grid">
          {filteredSites.map((site, i) => (
            <Link
              to={`/sites/${site.id}`}
              key={site.id}
              className="site-card animate-in"
              style={{ animationDelay: `${0.05 * i}s` }}
            >
              <div className="site-card-header">
                <div>
                  <div className="site-card-title">{site.name}</div>
                  <div className="site-card-slug">{site.slug}</div>
                </div>
                <StatusBadge status={site.status} />
              </div>

              <div className="site-card-meta">
                <div className="site-card-meta-item">
                  <span className="site-card-meta-label">Domain</span>
                  <span className="site-card-meta-value">
                    {site.railway_domain ? (
                      <a
                        href={`https://${site.railway_domain}`}
                        target="_blank"
                        rel="noopener"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {site.railway_domain}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="site-card-meta-item">
                  <span className="site-card-meta-label">Created</span>
                  <span className="site-card-meta-value">
                    {new Date(site.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                {site.custom_domain && (
                  <div className="site-card-meta-item">
                    <span className="site-card-meta-label">Custom</span>
                    <span className="site-card-meta-value">{site.custom_domain}</span>
                  </div>
                )}
              </div>

              <div className="site-card-actions" onClick={(e) => e.preventDefault()}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => handleDelete(e, site)}
                  disabled={deleting === site.id}
                >
                  {deleting === site.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
