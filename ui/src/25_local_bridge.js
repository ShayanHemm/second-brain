/* ═══════════════════════════ local bridge: the same capability surface, served by the local Second Brain service ═══════════════════════════ */
window.LocalBridge = (() => {
  const TOKEN = window.__SB_TOKEN__ || ''; const INFO = window.__SB_INFO__ || {};
  async function api(method, path, body, isForm) {
    const headers = { 'X-SB-Token': TOKEN }; if (body && !isForm) headers['Content-Type'] = 'application/json';
    let r; try { r = await fetch('/api' + path, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }); }
    catch (e) { throw { code: 'unavailable', message: 'The local service is not reachable. Is it running?' }; }
    if (r.status === 401) { if (!window.__sbReloading) { window.__sbReloading = true; try { localStorage.setItem('sb.draft', document.getElementById('capText') ? document.getElementById('capText').value : ''); } catch {} setTimeout(() => location.reload(), 1200); } throw { code: 'not_granted', message: 'The service was restarted; reconnecting…' }; }
    if (!r.ok) { let err = { code: r.status === 404 ? 'not_found' : 'upstream_error', message: r.statusText }; try { const j = await r.json(); if (j && j.error) err = j.error; } catch {} throw err; }
    if (r.status === 204) return null; return r.json();
  }
  const cache = new Map(); const subs = new Map(); // coll -> Set(listener)
  async function fetchColl(coll) { const docs = await api('GET', '/' + coll); cache.set(coll, docs); return docs; }
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapOf = (docs) => { const ds = docs.map((d) => ({ id: d.id, exists: true, data: () => d, metadata: meta })); return { docs: ds, size: ds.length, empty: !ds.length, docChanges: () => ds.map((doc, i) => ({ type: 'added', doc, oldIndex: -1, newIndex: i })), metadata: meta }; };
  const cmp = (a, b) => { if (a == null && b == null) return 0; if (a == null) return 1; if (b == null) return -1; return a < b ? -1 : a > b ? 1 : 0; };
  function applyQ(q, docs) {
    let out = docs.filter((d) => q.where.every(([f, op, v]) => { const x = d[f]; switch (op) { case '==': return x === v; case '!=': return x !== v; case '<': return x != null && x < v; case '<=': return x != null && x <= v; case '>': return x != null && x > v; case '>=': return x != null && x >= v; case 'in': return Array.isArray(v) && v.includes(x); case 'not-in': return Array.isArray(v) && !v.includes(x); case 'array-contains': return Array.isArray(x) && x.includes(v); default: return true; } }));
    if (q.orderBy) { const [f, dir] = q.orderBy; out = out.slice().sort((a, b) => (dir === 'desc' ? -1 : 1) * cmp(a[f], b[f])); if (dir === 'desc') { const nulls = out.filter((d) => d[f] == null); out = out.filter((d) => d[f] != null).concat(nulls); } }
    else out = out.slice().sort((a, b) => cmp(a.id, b.id));
    if (q.limit) out = out.slice(0, q.limit); return out;
  }
  function notify(coll, attempt = 0) { const set = subs.get(coll); if (!set || !set.size) return; fetchColl(coll).then((docs) => set.forEach((fn) => fn(docs))).catch(() => { if (attempt < 4) setTimeout(() => notify(coll, attempt + 1), 800 * (attempt + 1)); }); }
  function makeQuery(coll, q = { where: [], orderBy: null, limit: null }) {
    return {
      path: coll,
      where: (f, op, v) => makeQuery(coll, { ...q, where: [...q.where, [f, op, v]] }),
      orderBy: (f, dir = 'asc') => makeQuery(coll, { ...q, orderBy: [f, dir] }),
      limit: (n) => makeQuery(coll, { ...q, limit: n }),
      get: async () => snapOf(applyQ(q, await fetchColl(coll))),
      onSnapshot: (next, error) => { const fn = (docs) => next(snapOf(applyQ(q, docs))); if (!subs.has(coll)) subs.set(coll, new Set()); subs.get(coll).add(fn); fetchColl(coll).then(fn).catch((e) => error && error({ code: 'unavailable', message: String(e && e.message) })); return () => { const s = subs.get(coll); if (s) s.delete(fn); }; },
      doc: (id) => makeDoc(coll, id || ('d_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7))),
      add: async (data) => { const d = makeDoc(coll); await d.set(data); return d; },
    };
  }
  function makeDoc(coll, id) {
    const path = coll + '/' + id;
    return {
      id, path,
      get: async () => { try { const d = await api('GET', '/' + path); return { id, exists: true, data: () => d, metadata: meta }; } catch (e) { if (e.code === 'not_found') return { id, exists: false, data: () => undefined, metadata: meta }; throw e; } },
      set: async (data) => { await api('PUT', '/' + path, data); notify(coll); },
      update: async (data) => { const cur = await api('GET', '/' + path); await api('PUT', '/' + path, { ...cur, ...data }); notify(coll); },
      delete: async () => { await api('DELETE', '/' + path); notify(coll); },
      acquire: async () => ({ acquired: true }),
      onSnapshot: (next, error) => { const fn = (docs) => { const d = docs.find((x) => x.id === id); next({ id, exists: !!d, data: () => d, metadata: meta }); }; if (!subs.has(coll)) subs.set(coll, new Set()); subs.get(coll).add(fn); fetchColl(coll).then(fn).catch((e) => error && error({ code: 'unavailable', message: String(e && e.message) })); return () => { const s = subs.get(coll); if (s) s.delete(fn); }; },
      collection: (sub) => makeQuery(path + '/' + sub),
    };
  }
  const db = { collection: (p) => makeQuery(p), doc: (p) => { const parts = p.split('/'); const id = parts.pop(); return makeDoc(parts.join('/'), id); } };
  // live updates from other tabs or the CLI
  // ?nosse=1 disables the live stream (used by headless render checks)
  try { if (!/[?&]nosse=1/.test(location.search)) { const es = new EventSource('/api/events?t=' + encodeURIComponent(TOKEN)); es.onmessage = (ev) => { try { const e = JSON.parse(ev.data); if (e && e.collection) notify(e.collection); } catch {} }; } } catch {}
  // Claude, through the local service (which holds the API key)
  const sample = async (input, opts = {}) => { const r = await api('POST', '/ai/complete', { input, tier: opts.modelTier || 'default', json: false, purpose: opts.purpose || '' }); if (opts.onText) opts.onText({ text: r.text, delta: r.text }); return { text: r.text, truncated: !!r.truncated, modelTierApplied: r.tier }; };
  sample.json = async (input, opts = {}) => (await api('POST', '/ai/complete', { input, tier: opts.modelTier || 'default', json: true, purpose: opts.purpose || '' })).value;
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  const downloads = { save: async ({ filename, data }) => { const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.json') ? 'application/json' : 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000); return { status: 'saved' }; } };
  const assets = { upload: async (blob) => { const fd = new FormData(); fd.append('file', blob, blob.name || 'image.png'); return api('POST', '/assets', fd, true); }, list: async () => api('GET', '/assets'), delete: async (id) => api('DELETE', '/assets/' + id) };
  const user = { id: async () => 'local', isOwner: async () => true, canEdit: async () => true, can: async () => true, me: async () => ({ id: 'local', name: '', avatarUrl: '', color: '#888', email: null, isOwner: true, canEdit: true }), profiles: async (ids) => Object.fromEntries([].concat(ids).map((i) => [i, { id: i, name: '', avatarUrl: '', color: '#888', email: null, isMe: true, guest: false }])), name: async () => '', search: async () => [] };
  return { db, sample: INFO.aiAvailable ? sample : null, downloads, assets, user, info: INFO, api, refreshInfo: async () => { const i = await api('GET', '/info'); Object.assign(INFO, i); return i; } };
})();
