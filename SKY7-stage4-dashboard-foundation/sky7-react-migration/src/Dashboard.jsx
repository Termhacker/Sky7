import { useCallback, useEffect, useMemo, useState } from 'react';
import './dashboard.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const money = (kobo) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format((Number(kobo) || 0) / 100);
const imageSrc = (url) => !url ? '' : url.startsWith('http') ? url : `${API}${url}`;
const emptyItem = { name: '', description: '', priceNaira: '', categoryId: 'mains', available: true, badge: '', imageUrl: '', imageAlt: '' };

async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Request failed (${response.status})`);
  return payload.data;
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [page, setPage] = useState('overview');
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState({ businessName: 'SKY7', whatsappNumber: '', publicOrderNote: '' });
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState(emptyItem);
  const [staffDraft, setStaffDraft] = useState({ email: '', displayName: '', password: '' });
  const [preview, setPreview] = useState(null);
  const [savingId, setSavingId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadAuth = useCallback(async () => {
    try {
      const status = await api('/api/auth/status');
      setAuthStatus(status);
      try {
        const me = await api('/api/auth/me');
        setUser(me.user);
      } catch { setUser(null); }
    } catch (e) { setAuthError(`${e.message}. Make sure the SKY7 API is running on port 4000.`); }
    finally { setLoading(false); }
  }, []);

  const loadDashboard = useCallback(async (role = user?.role) => {
    if (!role) return;
    setError('');
    try {
      const menu = await api('/api/admin/menu');
      setCategories(menu);
      if (role === 'OWNER') {
        const [business, team, audit] = await Promise.all([
          api('/api/admin/settings'), api('/api/admin/staff'), api('/api/admin/audit'),
        ]);
        setSettings({ businessName: business.businessName || 'SKY7', whatsappNumber: business.whatsappNumber || '', publicOrderNote: business.publicOrderNote || '' });
        setStaff(team); setEvents(audit);
      }
    } catch (e) { setError(e.message); }
  }, [user?.role]);

  useEffect(() => { loadAuth(); }, [loadAuth]);
  useEffect(() => { if (user) loadDashboard(user.role); }, [user, loadDashboard]);

  const items = useMemo(() => categories.flatMap((category) => (category.items || []).map((item) => ({ ...item, categoryName: category.name, categoryId: category.id }))), [categories]);
  const activeItems = items.filter((item) => !item.archivedAt);
  const visibleItems = items.filter((item) =>
    (showArchived || !item.archivedAt) &&
    (categoryFilter === 'all' || item.categoryId === categoryFilter) &&
    `${item.name} ${item.description}`.toLowerCase().includes(search.toLowerCase()));
  const availableCount = activeItems.filter((item) => item.available).length;

  async function signIn(event) {
    event.preventDefault(); setAuthError(''); setAuthBusy(true);
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setUser(result.user); setPassword(''); setAuthStatus({ ownerSetupRequired: false });
    } catch (e) { setAuthError(e.message); }
    finally { setAuthBusy(false); }
  }
  async function signOut() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setUser(null); setCategories([]); setPage('overview'); window.history.replaceState({}, '', '/dashboard');
  }
  async function refresh() { await loadDashboard(user?.role); setNotice('Changes refreshed.'); }
  function updateLocal(id, key, value) {
    setCategories((old) => old.map((c) => ({ ...c, items: c.items.map((item) => item.id === id ? { ...item, [key]: value } : item) })));
  }
  async function saveItem(item) {
    setSavingId(item.id); setError(''); setNotice('');
    try {
      const body = { name: item.name, description: item.description, priceKobo: Math.round(Number(item.priceNaira !== undefined ? item.priceNaira : Number(item.priceKobo) / 100) * 100), categoryId: item.categoryId,
        available: Boolean(item.available), badge: item.badge || null, imageUrl: item.imageUrl || null, imageAlt: item.imageAlt || null, sortOrder: item.sortOrder || 0 };
      const saved = await api(`/api/admin/menu/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setCategories((old) => old.map((c) => ({ ...c, items: c.items.map((entry) => entry.id === saved.id ? saved : entry) })));
      setNotice(`${saved.name} saved and published.`);
    } catch (e) { setError(e.message); }
    finally { setSavingId(''); }
  }
  async function createItem(event) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      const created = await api('/api/admin/menu', { method: 'POST', body: JSON.stringify({
        name: draft.name, description: draft.description, priceKobo: Math.round(Number(draft.priceNaira) * 100),
        categoryId: draft.categoryId, available: Boolean(draft.available), badge: draft.badge || null,
        imageUrl: draft.imageUrl || null, imageAlt: draft.imageAlt || null,
      }) });
      setCategories((old) => old.map((c) => c.id === created.categoryId ? { ...c, items: [...c.items, created] } : c));
      setDraft(emptyItem); setShowCreate(false); setNotice(`${created.name} added to the menu.`);
    } catch (e) { setError(e.message); }
  }
  async function archiveItem(item) {
    const restoring = Boolean(item.archivedAt);
    if (!restoring && !window.confirm(`Archive ${item.name}? It will no longer appear on the public menu.`)) return;
    try {
      await api(`/api/admin/menu/${item.id}/${restoring ? 'restore' : 'archive'}`, { method: 'POST' });
      await loadDashboard(user?.role); setNotice(`${item.name} ${restoring ? 'restored' : 'archived'}.`);
    } catch (e) { setError(e.message); }
  }
  async function uploadImage(file, onUploaded) {
    if (!file) return;
    const form = new FormData(); form.append('image', file);
    try { const result = await api('/api/admin/uploads', { method: 'POST', body: form }); onUploaded(result.imageUrl); setNotice('Image uploaded. Save the menu item to publish it.'); }
    catch (e) { setError(e.message); }
  }
  async function saveSettings(event) {
    event.preventDefault();
    try { const result = await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({
      businessName: settings.businessName, whatsappNumber: settings.whatsappNumber || null, publicOrderNote: settings.publicOrderNote || null,
    }) }); setSettings({ businessName: result.businessName, whatsappNumber: result.whatsappNumber || '', publicOrderNote: result.publicOrderNote || '' }); setNotice('Business settings saved.'); }
    catch (e) { setError(e.message); }
  }
  async function addStaff(event) {
    event.preventDefault();
    try {
      await api('/api/admin/staff', { method: 'POST', body: JSON.stringify(staffDraft) });
      setStaffDraft({ email: '', displayName: '', password: '' }); setStaff(await api('/api/admin/staff')); setNotice('Staff account created.');
    } catch (e) { setError(e.message); }
  }
  async function toggleStaff(member) {
    try { await api(`/api/admin/staff/${member.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !member.isActive }) }); setStaff(await api('/api/admin/staff')); setNotice(`Staff account ${member.isActive ? 'deactivated' : 'activated'}.`); }
    catch (e) { setError(e.message); }
  }

  if (loading) return <div className="dash-loading"><span className="dash-mark">SKY<span>7</span></span><p>Opening your workspace…</p></div>;

  if (!user) return (
    <main className="auth-screen">
      <a className="auth-back" href="/">← Back to public menu</a>
      <section className="auth-card">
        <div className="auth-brand">SKY<span>7</span><small>RESTAURANT MANAGEMENT</small></div>
        <div className="auth-eyebrow">PRIVATE WORKSPACE</div>
        <h1>Good to see you.</h1>
        <p className="auth-subtitle">Sign in to manage the menu, availability and your restaurant settings.</p>
        {authStatus?.ownerSetupRequired && <div className="setup-callout"><strong>First-time setup</strong><p>No owner account exists yet. In the <code>server</code> directory, run <code>npm run db:create-owner</code> and follow the prompts. This creates the first owner securely from your terminal.</p></div>}
        <form onSubmit={signIn} className="auth-form">
          <label>Email address<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@sky7.com" /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" /></label>
          {authError && <p className="form-error" role="alert">{authError}</p>}
          <button className="primary-btn" disabled={authBusy}>{authBusy ? 'Signing in…' : 'Sign in'} <span>↗</span></button>
        </form>
        <p className="auth-foot">Access is limited to the owner and authorized staff.</p>
      </section>
    </main>
  );

  const isOwner = user.role === 'OWNER';
  const nav = [
    ['overview', 'Overview', '◫'],
    ['menu', 'Menu manager', '◇'],
    ...(isOwner ? [['staff', 'Staff access', '♙'], ['settings', 'Business settings', '⚙'], ['activity', 'Activity log', '≋']] : []),
  ];
  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <a className="dash-logo" href="/" aria-label="Return to SKY7 menu">SKY<span>7</span><small>RESTAURANT</small></a>
        <div className="side-caption">WORKSPACE</div>
        <nav className="dash-nav">{nav.map(([id, label, glyph]) => <button key={id} className={page === id ? 'selected' : ''} onClick={() => setPage(id)}><span>{glyph}</span>{label}{page === id && <i />}</button>)}</nav>
        <div className="sidebar-bottom"><div className="profile-chip"><span className="profile-avatar">{user.displayName?.slice(0, 1).toUpperCase()}</span><span><strong>{user.displayName}</strong><small>{isOwner ? 'Owner' : 'Authorized staff'}</small></span></div><button className="signout-btn" onClick={signOut}>↗ Sign out</button></div>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar"><div><span className="crumb">SKY7 / Workspace</span><h1>{({ overview: 'Overview', menu: 'Menu manager', staff: 'Staff access', settings: 'Business settings', activity: 'Activity log' })[page]}</h1></div><div className="top-actions"><span className="live-pill"><i /> API connected</span><a className="public-link" href="/" target="_blank" rel="noreferrer">View public menu ↗</a></div></header>
        <div className="dash-content">
          {notice && <div className="notice-banner"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notice">×</button></div>}
          {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
          {page === 'overview' && <section className="overview-page">
            <div className="welcome-row"><div><p className="eyebrow">YOUR RESTAURANT, AT A GLANCE</p><h2>Good day, {user.displayName.split(' ')[0]}.</h2><p>Everything at SKY7, thoughtfully in one place.</p></div><button className="primary-btn compact" onClick={() => setPage('menu')}>Manage menu <span>↗</span></button></div>
            <div className="stat-grid">
              <article className="stat-card"><span className="stat-icon">◇</span><small>ACTIVE MENU ITEMS</small><strong>{activeItems.length}</strong><p>Across {categories.length} fixed categories</p></article>
              <article className="stat-card"><span className="stat-icon">✓</span><small>AVAILABLE NOW</small><strong>{availableCount}</strong><p>{activeItems.length - availableCount} currently marked unavailable</p></article>
              <article className="stat-card"><span className="stat-icon">₦</span><small>MENU CATEGORIES</small><strong>{categories.length}</strong><p>Your original six categories</p></article>
            </div>
            <div className="section-heading"><div><p className="eyebrow">QUICK ACCESS</p><h3>Menu categories</h3></div><button className="text-btn" onClick={() => setPage('menu')}>Open menu manager →</button></div>
            <div className="category-grid">{categories.map((c, i) => <button key={c.id} className="category-tile" onClick={() => { setCategoryFilter(c.id); setPage('menu'); }}><span className="category-number">0{i + 1}</span><strong>{c.name}</strong><small>{c.items.filter((it) => !it.archivedAt).length} items</small><span className="tile-arrow">↗</span></button>)}</div>
            <div className="dashboard-note"><span>✳</span><div><strong>Changes publish as you save</strong><p>Menu edits are stored in the database immediately. Keep unavailable items listed so customers can still see what SKY7 offers.</p></div></div>
          </section>}
          {page === 'menu' && <section className="menu-page">
            <div className="page-intro"><div><p className="eyebrow">YOUR PUBLIC OFFERING</p><h2>Every detail matters.</h2><p>Edit prices, descriptions, photos and availability. Changes save to your menu database.</p></div><button className="primary-btn compact" onClick={() => { setDraft({ ...emptyItem, categoryId: categoryFilter === 'all' ? categories[0]?.id || 'mains' : categoryFilter }); setShowCreate(true); }}>＋ Add menu item</button></div>
            <div className="menu-toolbar"><div className="search-field"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a dish or drink…" /></div><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><label className="archived-toggle"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label></div>
            <div className="menu-count">{visibleItems.length} menu items <span>·</span> Prices are stored in kobo</div>
            <div className="menu-card-grid">{visibleItems.map((item) => <article className={`menu-card ${item.archivedAt ? 'is-archived' : ''}`} key={item.id}>
              <div className="menu-photo">{item.imageUrl ? <img src={imageSrc(item.imageUrl)} alt={item.imageAlt || item.name} /> : <div className="photo-placeholder"><span>SKY<span>7</span></span><small>YOUR PHOTO HERE</small></div>}
                <label className="upload-chip">↑ {item.imageUrl ? 'Replace photo' : 'Add photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => { uploadImage(e.target.files?.[0], (url) => updateLocal(item.id, 'imageUrl', url)); e.target.value = ''; }} /></label>
                <span className={`availability-tag ${item.available && !item.archivedAt ? 'is-available' : ''}`}>{item.archivedAt ? 'Archived' : item.available ? 'Available' : 'Unavailable'}</span>
              </div>
              <div className="menu-card-body"><div className="card-kicker">{item.categoryName}{item.badge ? <span>✦ {item.badge}</span> : null}</div>
                <label className="field-label">Item name<input value={item.name} onChange={(e) => updateLocal(item.id, 'name', e.target.value)} maxLength={120} /></label>
                <label className="field-label">Description<textarea value={item.description} onChange={(e) => updateLocal(item.id, 'description', e.target.value)} rows={3} maxLength={1200} /></label>
                <div className="card-edit-row"><label className="field-label price-field">Price (₦)<input type="number" min="0" step="1" value={item.priceNaira ?? (Number(item.priceKobo) / 100)} onChange={(e) => updateLocal(item.id, 'priceNaira', e.target.value)} /></label>
                  <label className="availability-control"><input type="checkbox" checked={Boolean(item.available)} onChange={(e) => updateLocal(item.id, 'available', e.target.checked)} /> Available</label></div>
                <label className="field-label">Chef’s note / badge<input value={item.badge || ''} onChange={(e) => updateLocal(item.id, 'badge', e.target.value)} placeholder="Optional" maxLength={80} /></label>
                <div className="card-actions"><button className="preview-btn" onClick={() => setPreview(item)}>Preview ↗</button><button className="save-btn" disabled={savingId === item.id || Boolean(item.archivedAt)} onClick={() => saveItem(item)}>{savingId === item.id ? 'Saving…' : 'Save changes'}</button></div>
                <button className="archive-link" onClick={() => archiveItem(item)}>{item.archivedAt ? 'Restore item' : 'Archive item'}</button>
              </div>
            </article>)}</div>
          </section>}
          {page === 'staff' && isOwner && <section className="settings-page"><div className="page-intro"><div><p className="eyebrow">PEOPLE & PERMISSIONS</p><h2>Good service starts with trust.</h2><p>Create and control staff access to menu management.</p></div></div>
            <div className="settings-layout"><form className="settings-card" onSubmit={addStaff}><p className="eyebrow">NEW ACCOUNT</p><h3>Invite a team member</h3><p className="settings-help">Staff can manage menu items. They cannot manage staff accounts or business settings.</p><label className="field-label">Full name<input value={staffDraft.displayName} onChange={(e) => setStaffDraft({ ...staffDraft, displayName: e.target.value })} required maxLength={100} /></label><label className="field-label">Email address<input type="email" value={staffDraft.email} onChange={(e) => setStaffDraft({ ...staffDraft, email: e.target.value })} required /></label><label className="field-label">Temporary password<input type="password" value={staffDraft.password} onChange={(e) => setStaffDraft({ ...staffDraft, password: e.target.value })} required minLength={12} autoComplete="new-password" /><small>At least 12 characters. Share it securely with the team member.</small></label><button className="save-btn" type="submit">Create staff account ↗</button></form>
              <div className="settings-card"><p className="eyebrow">AUTHORIZED STAFF</p><h3>Your team</h3>{staff.length ? <div className="staff-list">{staff.map((member) => <div className="staff-row" key={member.id}><span className="profile-avatar">{member.displayName.slice(0,1).toUpperCase()}</span><span className="staff-details"><strong>{member.displayName}</strong><small>{member.email}</small></span><span className={`staff-status ${member.isActive ? 'on' : 'off'}`}>{member.isActive ? 'Active' : 'Disabled'}</span><button className="text-btn" onClick={() => toggleStaff(member)}>{member.isActive ? 'Disable' : 'Enable'}</button></div>)}</div> : <p className="empty-state">No staff accounts yet. Create the first one here.</p>}</div>
            </div>
          </section>}
          {page === 'settings' && isOwner && <section className="settings-page"><div className="page-intro"><div><p className="eyebrow">THE DETAILS BEHIND THE EXPERIENCE</p><h2>Make it unmistakably SKY7.</h2><p>These settings control how customers contact you to place an order.</p></div></div><form className="settings-card settings-single" onSubmit={saveSettings}><p className="eyebrow">PUBLIC BUSINESS DETAILS</p><h3>Restaurant settings</h3><label className="field-label">Business name<input value={settings.businessName} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} required maxLength={100} /></label><label className="field-label">WhatsApp ordering number<input value={settings.whatsappNumber} onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })} placeholder="e.g. 2348012345678" /><small>Include country code. Use digits, spaces or +. Customers will send their order directly to this number.</small></label><label className="field-label">Public order note<textarea value={settings.publicOrderNote} onChange={(e) => setSettings({ ...settings, publicOrderNote: e.target.value })} rows={3} maxLength={500} placeholder="Optional note shown with orders" /></label><button className="save-btn" type="submit">Save business settings</button></form></section>}
          {page === 'activity' && isOwner && <section className="settings-page"><div className="page-intro"><div><p className="eyebrow">ACCOUNTABILITY</p><h2>Recent activity.</h2><p>A record of important account and menu changes.</p></div></div><div className="activity-list">{events.map((event) => <article className="activity-row" key={event.id}><span className="activity-dot" /><div><strong>{event.summary}</strong><p>{event.actor?.displayName || 'System'} · {event.action} · {event.entityType}</p></div><time>{new Date(event.createdAt).toLocaleString()}</time></article>)}</div></section>}
        </div>
      </main>
      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="new-item-title"><button className="modal-close" onClick={() => setShowCreate(false)} aria-label="Close">×</button><p className="eyebrow">EXPAND THE MENU</p><h2 id="new-item-title">Add something wonderful.</h2><form onSubmit={createItem}><label className="field-label">Category<select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field-label">Item name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={120} /></label><label className="field-label">Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required rows={3} maxLength={1200} /></label><div className="form-two"><label className="field-label">Price (₦)<input type="number" min="0" step="1" value={draft.priceNaira} onChange={(e) => setDraft({ ...draft, priceNaira: e.target.value })} required /></label><label className="field-label">Badge (optional)<input value={draft.badge} onChange={(e) => setDraft({ ...draft, badge: e.target.value })} maxLength={80} /></label></div><label className="availability-control"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} /> Available to order</label><button className="save-btn" type="submit">Add to menu ↗</button></form></section></div>}
      {preview && <div className="preview-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(null); }}><button className="preview-close" onClick={() => setPreview(null)}>× Close preview</button><div className="preview-window"><div className="preview-window-top"><span>SKY<span>7</span></span><small>IMMERSIVE MENU PREVIEW</small><span className={`preview-status ${preview.available ? 'is-available' : ''}`}>{preview.available ? 'Available' : 'Currently unavailable'}</span></div><div className="preview-stage"><div className="preview-arch"><div className="preview-art">{preview.imageUrl ? <img src={imageSrc(preview.imageUrl)} alt={preview.imageAlt || preview.name} /> : <span className="preview-empty">SKY<span>7</span><small>IMAGE TO BE ADDED</small></span>}</div></div><div className="preview-copy"><p className="eyebrow">{preview.categoryName || categories.find((c) => c.id === preview.categoryId)?.name || 'SKY7 MENU'}</p><h2>{preview.name || 'Your menu item'}</h2><p>{preview.description}</p><div className="preview-price">{money(preview.priceNaira !== undefined ? Number(preview.priceNaira) * 100 : preview.priceKobo)}</div>{preview.badge && <span className="preview-badge">✦ {preview.badge}</span>}<p className="preview-caption">Dinner above the noise of the city.</p></div></div><div className="preview-footer">Preview of the item card · close to return to editing</div></div></div>}
    </div>
  );
}
