import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Check, ChevronDown, Circle, Columns3, Filter, List, LockKeyhole, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import './style.css';

const statuses = ['Backlog', 'Ready', 'In Progress', 'Blocked', 'Done'];
const slug = value => value.toLowerCase().replaceAll(' ', '-');
const displayName = name => name === 'wavey0x' ? 'wavey' : name;
const initials = name => name === 'wavey0x' ? 'w' : name === 'dudesahn' ? 'd' : name.slice(0, 1);
const avatarUrls = {
  dudesahn: 'https://avatars.githubusercontent.com/u/23222916?v=4&s=48',
  wavey0x: 'https://avatars.githubusercontent.com/u/82397455?v=4&s=48',
};
function Avatar({ name }) {
  const [failed, setFailed] = useState(false);
  return <span className={`avatar avatar-${name}`}>{avatarUrls[name] && !failed ? <img src={avatarUrls[name]} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : initials(name)}</span>;
}
function dateLabel(value, time = false) {
  if (!value) return 'Never';
  return new Date(value.length === 10 ? value + 'T12:00:00Z' : value).toLocaleString('en-US', { month: 'short', day: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }) });
}
function ProjectTag({ name }) { return name ? <span className={`project-tag project-${slug(name)}`}><span />{name}</span> : null; }
function CompactOwners({ names }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const tooltipId = useId();
  const label = names.length ? names.map(displayName).join(', ') : 'Unassigned';
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div ref={container} className="owners compact"
    onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button className="owner-trigger" aria-label={names.length ? `Assigned to ${label}` : label}
      aria-describedby={open ? tooltipId : undefined}
      onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); } }}>
      {names.length ? <span className="avatars">{names.map(name => <Avatar name={name} key={name}/>)}</span> : <span className="unassigned">—</span>}
    </button>
    {open && <span id={tooltipId} className="owner-tooltip" role="tooltip">{label}</span>}
  </div>;
}
function Owners({ names, compact = false }) {
  if (compact) return <CompactOwners names={names}/>;
  if (!names.length) return <span className="unassigned">Unassigned</span>;
  return <div className="owners" aria-label={`Assigned to ${names.map(displayName).join(', ')}`}>
    <div className="avatars">{names.map(name => <Avatar name={name} key={name}/>)}</div>
    <span className="owner-names">{names.map(displayName).join(', ')}</span>
  </div>;
}
function Card({ item }) {
  return <article className={`work-card ${item.status === 'Done' ? 'completed-card' : ''}`}>
    <h3>{item.title}</h3>
    <div className="card-meta"><ProjectTag name={item.project}/><Owners names={item.assignees} compact/></div>
  </article>;
}
function Column({ status, items }) {
  const [expanded, setExpanded] = useState(false);
  const limit = status === 'Done' && !expanded ? 6 : items.length;
  return <section className={`column column-${slug(status)}`} aria-label={`${status}, ${items.length} items`}>
    <div className="column-header"><div><span className={`status-dot status-${slug(status)}`}/><h2>{status}</h2><span className="column-count">{items.length}</span></div>{status === 'Done' && <Check size={14}/>}</div>
    <div className="cards">{items.slice(0, limit).map(item => <Card item={item} key={item.id}/>)}
      {!items.length && <div className="empty-column"><Circle size={18}/><span>Nothing here for now</span></div>}
    </div>
    {status === 'Done' && items.length > 6 && <button className="show-more" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show all ${items.length} completed items`}<ChevronDown size={14} className={expanded ? 'rotate' : ''}/></button>}
  </section>;
}
function SyncDialog({ close, refresh, automatic, intervalHours = 1 }) {
  const dialog = useRef(null);
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => { dialog.current.showModal(); }, []);
  async function sync(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setOk(false);
    try {
      const response = await fetch('/api/admin/sync', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(180000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sync failed. Please try again.');
      setMessage(`${result.count} items updated. Your board is up to date.`); setOk(true); setKey(''); await refresh();
    } catch (error) { setMessage(error.name === 'TimeoutError' ? 'The sync is taking longer than expected. Refresh the board before retrying.' : error.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="sync-dialog" onCancel={close} onClick={event => { if (event.target === dialog.current) close(); }}>
    <div className="dialog-top"><span className="dialog-icon"><RefreshCw size={20}/></span><button className="icon-button" aria-label="Close sync panel" onClick={close}><X size={18}/></button></div>
    <h2>Refresh from GitHub</h2><p>The board updates {intervalHours === 1 ? 'hourly' : `every ${intervalHours} hours`}. Team members can also publish the latest changes here.</p>
    {!automatic && <div className="setup-note">Live sync is not connected yet.</div>}
    <form onSubmit={sync}><label htmlFor="sync-key">Admin sync key</label><input id="sync-key" type="password" value={key} onChange={event => setKey(event.target.value)} placeholder="Enter your sync key" autoComplete="off" required minLength={32}/><span className="input-help"><LockKeyhole size={12}/>Used for this request only. Never saved in your browser.</span>
    <button className="primary-button" disabled={busy || !automatic || key.length < 32}><RefreshCw size={15} className={busy ? 'spinning' : ''}/>{busy ? 'Syncing…' : 'Sync now'}</button></form>
    {message && <div className={`sync-message ${ok ? 'success' : 'error'}`} role="status">{message}</div>}
  </dialog>;
}
function App() {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('board');
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('all');
  const [project, setProject] = useState('all');
  const [status, setStatus] = useState('all');
  const [showEmpty, setShowEmpty] = useState(false);
  const [settings, setSettings] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const searchRef = useRef(null);
  async function refresh() {
    try {
      const response = await fetch('/api/board', { cache: 'no-store' });
      if (!response.ok) throw new Error('The board could not be loaded. Please try again.');
      setBoard(await response.json()); setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { refresh(); const timer = setInterval(refresh, 60_000); return () => clearInterval(timer); }, []);
  useEffect(() => { const handler = event => { if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !syncOpen) { event.preventDefault(); searchRef.current?.focus(); } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, [syncOpen]);
  const items = board?.items ?? [];
  const projects = [...new Set(items.map(item => item.project).filter(Boolean))].sort();
  const owners = [...new Set(items.flatMap(item => item.assignees))].sort();
  const filtered = useMemo(() => items.filter(item => (owner === 'all' || (owner === 'unassigned' ? item.assignees.length === 0 : item.assignees.includes(owner))) && (project === 'all' || (project === 'none' ? !item.project : item.project === project)) && (status === 'all' || item.status === status) && `${item.title} ${item.project || ''} ${item.assignees.map(displayName).join(' ')}`.toLowerCase().includes(search.toLowerCase().trim())), [items, owner, project, status, search]);
  const columns = statuses.filter(s => status === 'all' ? showEmpty || ['Backlog', 'In Progress', 'Done'].includes(s) || filtered.some(item => item.status === s) : s === status);
  const activeFilter = Boolean(search || owner !== 'all' || project !== 'all' || status !== 'all');
  function reset() { setSearch(''); setOwner('all'); setProject('all'); setStatus('all'); }
  return <div className="app-shell">
    <header className="site-header"><a href="/" className="brand" aria-label="yLockers work board">yLockers</a><span className="header-label">Work board</span><button className="sync-button" aria-label="Sync options" onClick={() => setSyncOpen(true)}><RefreshCw size={13}/><span>Sync</span></button></header>
    <main>
      <h1 className="sr-only">yLockers work board</h1>
      <div className="toolbar"><div className="view-toggle" aria-label="Display layout"><button className={view === 'board' ? 'selected' : ''} aria-pressed={view === 'board'} onClick={() => setView('board')}><Columns3 size={15}/>Board</button><button className={view === 'list' ? 'selected' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16}/>List</button></div><div className="filters"><label className="search-box"><Search size={15}/><input ref={searchRef} aria-label="Search work" placeholder="Search work…" value={search} onChange={event => setSearch(event.target.value)}/>{search ? <button aria-label="Clear search" onClick={() => setSearch('')}><X size={13}/></button> : <kbd>/</kbd>}</label><label className="filter-select"><span className="sr-only">Assignee</span><select value={owner} onChange={e => setOwner(e.target.value)}><option value="all">Everyone</option>{owners.map(o => <option key={o} value={o}>{displayName(o)}</option>)}{items.some(i => !i.assignees.length) && <option value="unassigned">Unassigned</option>}</select><ChevronDown size={13}/></label><label className="filter-select project-filter"><span className="sr-only">Project</span><select value={project} onChange={e => setProject(e.target.value)}><option value="all">All projects</option>{projects.map(p => <option key={p}>{p}</option>)}{items.some(i => !i.project) && <option value="none">No project</option>}</select><ChevronDown size={13}/></label><div className="settings-wrap"><button className={`icon-button display-button ${settings ? 'selected' : ''}`} aria-label="Display options" aria-expanded={settings} onClick={() => setSettings(!settings)}><SlidersHorizontal size={16}/></button>{settings && <div className="display-options"><label><input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)}/>Show empty columns</label><label className="status-select">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select></label></div>}</div></div></div>
      <div className="board-caption"><div>{activeFilter ? <><Filter size={12}/><span>{filtered.length} of {items.length} items</span><button onClick={reset}>Clear filters<X size={11}/></button></> : <><span className={`caption-dot ${!board?.syncedAt || board?.sync.stale ? 'muted' : ''}`}/><span>{board?.syncedAt ? `Updated ${dateLabel(board.syncedAt, true)}` : board ? 'Not synced yet' : 'Loading board…'}</span>{board?.sync.stale && <span className="stale-label">Update delayed</span>}</>}</div><span>{board?.sync.configured ? board.sync.intervalHours === 1 ? 'Syncs hourly' : `Syncs every ${board.sync.intervalHours} hours` : 'Live sync not connected'}</span></div>
      {error && <div className="load-error" role="alert">{error}<button onClick={refresh}>Try again</button></div>}
      {!board && !error && <div className="loading-state"><RefreshCw className="spinning" size={18}/>Loading work…</div>}
      {board && !items.length && <div className="no-results"><h2>No work published yet</h2><p>{board.syncedAt ? 'No public items are currently available.' : 'The board will appear after its first sync.'}</p></div>}
      {board && items.length > 0 && !filtered.length && <div className="no-results"><Search size={25}/><h2>No matching work</h2><p>Try a different search or clear your filters.</p><button className="outline-button" onClick={reset}>Clear filters</button></div>}
      {board && filtered.length > 0 && (view === 'board' ? <div className="board" style={{ '--column-count': columns.length }}>{columns.map(s => <Column key={s} status={s} items={filtered.filter(item => item.status === s)}/>)}</div> : <div className="list-container"><table><thead><tr><th>Work</th><th>Project</th><th>Assigned to</th><th>Status</th></tr></thead><tbody>{[...filtered].sort((a, b) => statuses.indexOf(a.status) - statuses.indexOf(b.status)).map(item => <tr key={item.id}><td>{item.title}</td><td><ProjectTag name={item.project}/></td><td><Owners names={item.assignees}/></td><td><span className="table-status"><span className={`status-dot status-${slug(item.status)}`}/>{item.status}</span></td></tr>)}</tbody></table></div>)}
    </main>
    {syncOpen && <SyncDialog close={() => setSyncOpen(false)} refresh={refresh} automatic={board?.sync.configured} intervalHours={board?.sync.intervalHours}/>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
