import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { api, setGetToken } from '../lib/api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ShellTerminal from '../components/ShellTerminal.jsx';

export default function SiteDetail() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const [site, setSite] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [method, setMethod] = useState('direct');
  const [selectedUser, setSelectedUser] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [backupSources, setBackupSources] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedBackup, setSelectedBackup] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [restoreError, setRestoreError] = useState('');

  const pollRef = useRef(null);

  useEffect(() => {
    setGetToken(getToken);
    loadSite();
    return () => clearInterval(pollRef.current);
  }, [id, getToken]);

  async function loadSite() {
    try {
      const data = await api.getSite(id);
      setSite(data);
      if (data.status === 'active') {
        clearInterval(pollRef.current);
        try {
          const u = await api.getSiteUsers(id);
          setUsers(u);
          if (u.length > 0 && !selectedUser) setSelectedUser(u[0].user_login);
        } catch {}
        loadBackups(id);
      }
      if (data.status === 'provisioning' && !pollRef.current) startPolling();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBackups(siteId) {
    setBackupsLoading(true);
    try {
      const data = await api.listBackups(siteId || id);
      const sources = data.sources || [];
      setBackupSources(sources);
      if (sources.length > 0) {
        setSelectedSource(sources[0].name);
        if (sources[0].dates.length > 0) setSelectedBackup(sources[0].dates[0]);
      }
    } catch {
      setBackupSources([]);
    } finally {
      setBackupsLoading(false);
    }
  }

  async function handleRestore() {
    if (!selectedBackup) return;
    setRestoring(true);
    setRestoreResult(null);
    setRestoreError('');
    try {
      const result = await api.restoreSite(id, selectedSource, selectedBackup);
      setRestoreResult(result);
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoring(false);
    }
  }

  function startPolling() {
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getSite(id);
        setSite(data);
        if (data.status === 'active') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          try {
            const u = await api.getSiteUsers(id);
            setUsers(u);
            if (u.length > 0 && !selectedUser) setSelectedUser(u[0].user_login);
          } catch {}
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {}
    }, 3000);
  }

  async function handlePasswordReset(e) {
    e.preventDefault();
    setResetting(true);
    setError('');
    setSuccess('');
    try {
      const data = { method, userLogin: selectedUser };
      if (method === 'direct') data.newPassword = newPassword;
      const result = await api.resetPassword(id, data);
      setSuccess(result.message);
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        Loading site...
      </div>
    );
  }

  if (!site) return <div className="alert alert-error">Site not found</div>;

  return (
    <div>
      <Link to="/sites" className="back-link">All Sites</Link>

      <div className="page-header">
        <h1>{site.name}</h1>
        <StatusBadge status={site.status} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card-grid">
        {/* Details Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-icon">i</div>
            <h3>Details</h3>
          </div>
          <dl className="detail-list">
            <dt>Slug</dt>
            <dd><code>{site.slug}</code></dd>
            <dt>Database</dt>
            <dd><code>{site.db_name}</code></dd>
            <dt>Redis</dt>
            <dd><code>{site.redis_prefix}</code></dd>
            <dt>Domain</dt>
            <dd>
              {site.railway_domain ? (
                <a href={`https://${site.railway_domain}`} target="_blank" rel="noopener">
                  {site.railway_domain}
                </a>
              ) : (
                <span className="muted">Pending...</span>
              )}
            </dd>
            <dt>Created</dt>
            <dd>
              {new Date(site.created_at).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </dl>
          {site.error_message && (
            <div className="alert alert-error" style={{ marginTop: '1rem', marginBottom: 0 }}>
              {site.error_message}
            </div>
          )}
        </div>

        {/* Provisioning State */}
        {site.status === 'provisioning' && (
          <div className="card provisioning-card">
            <div className="spinner" />
            <div className="provisioning-text">Deploying your site</div>
            <p className="muted">This usually takes 2-3 minutes. The page will update automatically.</p>
          </div>
        )}

        {/* Password Reset */}
        {site.status === 'active' && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>
                ⚿
              </div>
              <h3>Password Reset</h3>
            </div>

            <form onSubmit={handlePasswordReset}>
              <div className="form-group">
                <label>WordPress User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="input"
                >
                  {users.length > 0 ? (
                    users.map((u) => (
                      <option key={u.ID} value={u.user_login}>
                        {u.user_login} ({u.user_email})
                      </option>
                    ))
                  ) : (
                    <option value="admin">admin</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Reset Method</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" value="direct" checked={method === 'direct'} onChange={() => setMethod('direct')} />
                    Set new password directly
                  </label>
                  <label className="radio-label">
                    <input type="radio" value="email" checked={method === 'email'} onChange={() => setMethod('email')} />
                    Send reset email
                  </label>
                </div>
              </div>

              {method === 'direct' && (
                <div className="form-group">
                  <label>New Password</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="input"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={resetting || (method === 'direct' && newPassword.length < 8)}
                className="btn btn-danger"
              >
                {resetting ? (
                  <>
                    <span className="spinner-inline" />
                    Resetting...
                  </>
                ) : method === 'direct' ? (
                  'Update Password'
                ) : (
                  'Send Reset Email'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Restore from Backup */}
        {site.status === 'active' && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon" style={{ background: 'rgba(107,140,255,0.12)', color: '#6b8cff' }}>
                ↺
              </div>
              <h3>Restore from Backup</h3>
            </div>

            {backupsLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="spinner-inline" />
                <span className="muted">Loading backups...</span>
              </div>
            ) : backupSources.length === 0 ? (
              <p className="muted">No backups found in bucket.</p>
            ) : (
              <>
                <div className="form-group">
                  <label>Backup Source</label>
                  <select
                    className="input"
                    value={selectedSource}
                    onChange={(e) => {
                      const src = e.target.value;
                      setSelectedSource(src);
                      setRestoreResult(null);
                      setRestoreError('');
                      const found = backupSources.find((s) => s.name === src);
                      if (found && found.dates.length > 0) setSelectedBackup(found.dates[0]);
                      else setSelectedBackup('');
                    }}
                  >
                    {backupSources.map((s) => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {selectedSource && (() => {
                  const src = backupSources.find((s) => s.name === selectedSource);
                  const dates = src ? src.dates : [];
                  return dates.length > 0 ? (
                    <div className="form-group">
                      <label>Backup Date</label>
                      <select
                        className="input"
                        value={selectedBackup}
                        onChange={(e) => {
                          setSelectedBackup(e.target.value);
                          setRestoreResult(null);
                          setRestoreError('');
                        }}
                      >
                        {dates.map((date) => (
                          <option key={date} value={date}>{date}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="muted">No dates available for this source.</p>
                  );
                })()}

                <button
                  className="btn btn-danger"
                  disabled={restoring || !selectedBackup || !selectedSource}
                  onClick={handleRestore}
                >
                  {restoring ? (
                    <>
                      <span className="spinner-inline" />
                      Restoring...
                    </>
                  ) : (
                    'Restore Database'
                  )}
                </button>

                {restoreError && (
                  <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                    {restoreError}
                  </div>
                )}

                {restoreResult && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="alert alert-success">
                      {restoreResult.message || 'Database restored successfully.'}
                    </div>
                    {restoreResult.filesCommand && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p className="muted" style={{ marginBottom: '0.4rem' }}>
                          Run this command in the Shell Access card below to restore files:
                        </p>
                        <pre style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          fontSize: '0.78rem',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}>
                          <code>{restoreResult.filesCommand}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Quick Links */}
        {site.railway_domain && (
          <div className="card">
            <div className="card-header">
              <div className="card-icon">↗</div>
              <h3>Quick Links</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <a href={`https://${site.railway_domain}`} target="_blank" rel="noopener" className="quick-link">
                <div className="quick-link-icon">◆</div>
                <div>
                  <div style={{ fontWeight: 500 }}>View Site</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{site.railway_domain}</div>
                </div>
              </a>
              <a href={`https://${site.railway_domain}/wp-admin`} target="_blank" rel="noopener" className="quick-link">
                <div className="quick-link-icon" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>⚙</div>
                <div>
                  <div style={{ fontWeight: 500 }}>WP Admin</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Dashboard & settings</div>
                </div>
              </a>
              <a href={`https://${site.railway_domain}/wp-login.php`} target="_blank" rel="noopener" className="quick-link">
                <div className="quick-link-icon" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>→</div>
                <div>
                  <div style={{ fontWeight: 500 }}>WP Login</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Sign in to WordPress</div>
                </div>
              </a>
            </div>
          </div>
        )}

        {/* Shell */}
        {site.status === 'active' && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <div className="card-icon" style={{ background: 'rgba(107,140,255,0.12)', color: '#6b8cff' }}>›_</div>
              <h3>Shell Access</h3>
              <span className="muted" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>Interactive bash on the WordPress container</span>
            </div>
            <ShellTerminal siteId={id} getToken={getToken} />
          </div>
        )}
      </div>
    </div>
  );
}
