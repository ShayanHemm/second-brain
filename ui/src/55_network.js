/* ═══════════════════════════ network view (canvas + d3-force) with clusters, thresholds, ego view, timeline ═══════════════════════════ */
const Net = { nodes: [], links: [], clusters: new Map(), sim: null, canvas: null, ctx: null, t: null, hover: null, w: 0, h: 0, sig: '', pal: {}, zoom: null, pos: new Map(), userZoomed: false };
const CLUSTER_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CLUSTER_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#3fae3f', '#9085e9', '#e66767'];
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function isLightTheme() { const g = cssVar('--ground').replace('#', ''); if (g.length < 6) return false; const r = parseInt(g.slice(0, 2), 16), gg = parseInt(g.slice(2, 4), 16), b = parseInt(g.slice(4, 6), 16); return (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255 > 0.5; }
function readPalette() {
  const p = {}; for (const t of TYPES) p['t-' + t] = cssVar('--t-' + t); for (const k of ['theme', 'person', 'project', 'goal']) p['k-' + k] = cssVar('--k-' + k);
  p.ink = cssVar('--ink'); p.muted = cssVar('--muted'); p.line = cssVar('--line-strong'); p.accent = cssVar('--accent'); p.ground = cssVar('--sunk'); p.other = cssVar('--muted'); p.clusters = isLightTheme() ? CLUSTER_LIGHT : CLUSTER_DARK; Net.pal = p;
}

/* ─── clustering: label propagation over concept co-occurrence (pure; also used by Heads-up) ─── */
function conceptGraph(entries, kinds = { theme: true, person: true, project: true, goal: true }) {
  const nodes = new Map(); const w = new Map();
  const key = (kind, label, gid) => kind + ':' + slug(gid || label);
  for (const e of entries) {
    const cons = [];
    if (kinds.theme) for (const t of e.themes || []) cons.push([key('theme', t), 'theme', t, null]);
    if (kinds.person) for (const t of e.people || []) cons.push([key('person', t), 'person', t, null]);
    if (kinds.project) for (const t of e.projects || []) cons.push([key('project', t), 'project', t, null]);
    if (kinds.goal) for (const g of e.goals || []) cons.push([key('goal', goalLabel(g), g), 'goal', goalLabel(g), g]);
    const uniq = [...new Map(cons.map((c) => [c[0], c])).values()];
    for (const [id, kind, label, gid] of uniq) { let n = nodes.get(id); if (!n) { n = { id, kind, label, gid, n: 0, entries: [] }; nodes.set(id, n); } n.n++; n.entries.push(e.id); }
    for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) { const a = uniq[i][0], b = uniq[j][0]; const k = a < b ? a + '|' + b : b + '|' + a; w.set(k, (w.get(k) || 0) + 1); }
  }
  return { nodes, w };
}
/* Louvain community detection (modularity, weighted) with a resolution sweep; ids are strings, edges are [a, b, weight]. */
function louvainCommunities(ids, edges, resolution = 1) {
  const membership = new Map(ids.map((i) => [i, i]));
  let nodeIds = [...ids], edgeList = edges.filter((e) => e[2] > 0);
  for (let level = 0; level < 10; level++) {
    const { comm, moved } = louvainLocal(nodeIds, edgeList, resolution);
    if (!moved) break;
    for (const i of ids) membership.set(i, comm.get(membership.get(i)));
    const agg = new Map();
    for (const [x, y, wt] of edgeList) { const cx = comm.get(x), cy = comm.get(y); const key = cx <= cy ? cx + '\u0001' + cy : cy + '\u0001' + cx; agg.set(key, (agg.get(key) || 0) + wt); }
    nodeIds = [...new Set(comm.values())].sort(); edgeList = [...agg.entries()].map(([key, wt]) => { const [x, y] = key.split('\u0001'); return [x, y, wt]; });
    if (nodeIds.length <= 1) break;
  }
  return membership;
}
function louvainLocal(nodeIds, edges, resolution) {
  const k = new Map(), nb = new Map(); let m2 = 0;
  const addNb = (x, y, wt) => { if (!nb.has(x)) nb.set(x, new Map()); nb.get(x).set(y, (nb.get(x).get(y) || 0) + wt); };
  for (const [x, y, wt] of edges) { if (x === y) { k.set(x, (k.get(x) || 0) + 2 * wt); m2 += 2 * wt; } else { k.set(x, (k.get(x) || 0) + wt); k.set(y, (k.get(y) || 0) + wt); addNb(x, y, wt); addNb(y, x, wt); m2 += 2 * wt; } }
  const comm = new Map(nodeIds.map((i) => [i, i]));
  if (!m2) return { comm, moved: false };
  const tot = new Map(nodeIds.map((i) => [i, k.get(i) || 0])); let movedAny = false;
  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (const i of nodeIds) {
      const ki = k.get(i) || 0; const ci = comm.get(i); tot.set(ci, (tot.get(ci) || 0) - ki);
      const cand = new Map(); for (const [j, wt] of nb.get(i) || []) { const cj = comm.get(j); cand.set(cj, (cand.get(cj) || 0) + wt); }
      let best = ci, bestGain = (cand.get(ci) || 0) - resolution * (tot.get(ci) || 0) * ki / m2;
      for (const [c, kin] of cand) { const gain = kin - resolution * (tot.get(c) || 0) * ki / m2; if (gain > bestGain + 1e-12) { best = c; bestGain = gain; } }
      comm.set(i, best); tot.set(best, (tot.get(best) || 0) + ki); if (best !== ci) { moved = true; movedAny = true; }
    }
    if (!moved) break;
  }
  const rep = new Map(); for (const i of nodeIds) { const c = comm.get(i); if (!rep.has(c) || i < rep.get(c)) rep.set(c, i); }
  return { comm: new Map(nodeIds.map((i) => [i, rep.get(comm.get(i))])), moved: movedAny };
}
function clusterSummary(entries, kinds) {
  const { nodes, w } = conceptGraph(entries, kinds); const N = entries.length;
  // a theme that runs through more than half of a reasonably sized journal is a backdrop, not a constellation
  const backdrop = new Set(); if (N >= 6) for (const [id, n] of nodes) if (n.kind === 'theme' && n.n / N > 0.5 && n.n >= 4) backdrop.add(id);
  const ids = [...nodes.keys()].filter((id) => !backdrop.has(id)).sort();
  const edges = []; for (const [key, raw] of w) { const [x, y] = key.split('|'); if (backdrop.has(x) || backdrop.has(y) || !nodes.has(x) || !nodes.has(y)) continue; const nx = nodes.get(x).n, ny = nodes.get(y).n; edges.push([x, y, raw / Math.max(1, nx + ny - raw)]); }
  let label = new Map();
  for (const res of [1, 1.4, 1.9, 2.5]) {
    label = louvainCommunities(ids, edges, res); const sizes = new Map(); for (const l of label.values()) sizes.set(l, (sizes.get(l) || 0) + 1);
    const biggest = Math.max(0, ...sizes.values()); if (ids.length < 6 || biggest / Math.max(1, ids.length) <= 0.6 || sizes.size >= 3) break;
  }
  const groups = new Map(); for (const [id, l] of label) { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(nodes.get(id)); }
  const overall = mean(entries.map(effMood)); const today = new Date();
  const clusters = [...groups.values()].map((members) => { members.sort((a, b) => b.n - a.n); const eids = new Set(members.flatMap((m) => m.entries)); const es = [...eids].map(entry).filter(Boolean); const m = mean(es.map(effMood)); const recent = es.filter((e) => daysBetween(fromKey(e.date), today) < 30).length, before = es.filter((e) => { const d = daysBetween(fromKey(e.date), today); return d >= 30 && d < 60; }).length; return { id: members[0].id, name: members[0].label, members, entries: [...eids], size: eids.size, mood: m, moodDiff: m != null && overall != null ? m - overall : null, recent, before }; }).sort((a, b) => b.size - a.size || b.members.length - a.members.length);
  clusters.forEach((c, i) => (c.slot = i < 8 ? i : -1));
  return { clusters, nodes, w, overall, backdrop: [...backdrop].map((id) => nodes.get(id)) };
}

/* ─── view ─── */
function renderNetwork() {
  const root = $('#view-network');
  if (!root.dataset.ready) {
    root.innerHTML = `<div class="view-head"><h2>Network</h2><p class="muted small" style="max-width:62ch;margin:0">Entries orbit the themes, people, projects and goals they mention. Nodes that keep appearing in the same entries are grouped into named constellations. Drag, zoom, click a node; the panel below reads the constellations for you.</p></div>
      <div class="net-wrap" id="netWrap"><canvas id="netCanvas" aria-label="Network of entries and themes"></canvas><div class="net-tools" id="netTools"></div><div class="net-legend" id="netLegend"></div><div class="net-tip" id="netTip"></div><div class="net-empty" id="netEmpty" hidden>Nothing to show in this window.</div></div>
      <div id="netClusters"></div>`;
    root.dataset.ready = '1'; initNet();
  }
  renderNetTools(); if (Net.resize) Net.resize(); buildGraph(); renderClusterPanel();
  if (SB.netFocus) { const f = SB.netFocus; SB.netFocus = null; focusNode(f.kind === 'entry' ? f.id : f.kind === 'cluster' ? f.id : f.kind + ':' + slug(f.id), f.kind === 'cluster'); }
}
function renderNetTools() {
  const n = SB.net; const chip = (a, d, label, on, extra = '') => `<button class="chip" data-action="${a}" ${d} aria-pressed="${String(!!on)}">${extra}${label}</button>`;
  $('#netTools').innerHTML = [[30, '30 days'], [90, '90 days'], [365, 'year'], [0, 'all time']].map(([d, l]) => chip('netDays', `data-d="${d}"`, l, n.days === d)).join('') +
    ['entry', 'theme', 'person', 'project', 'goal'].map((k) => chip('netKind', `data-k="${k}"`, k === 'entry' ? 'entries' : k + 's', n.kinds[k], `<i class="sw" style="--c:${k === 'entry' ? 'var(--t-journal)' : kindVar(k)}"></i>`)).join('') +
    chip('netColour', '', n.colour === 'cluster' ? 'colour: constellation' : 'colour: kind', false) +
    chip('netMin', '', `min ${n.minCount} ${n.minCount === 1 ? 'entry' : 'entries'}`, n.minCount > 1) + (n.kinds.entry ? '' : chip('netMinLink', '', `links ≥ ${n.minLink}`, n.minLink > 1)) +
    chip('netEgo', '', 'neighbourhood', n.ego, '') + chip('netLayout', '', n.layout === 'timeline' ? 'layout: timeline' : 'layout: organic', n.layout === 'timeline') +
    `<button class="chip" data-action="netFit">fit</button><button class="chip" data-action="netShake">re-layout</button><span class="pill" id="netCount"></span>`;
}
ACTIONS.netDays = (el) => { SB.net.days = Number(el.dataset.d); Net.userZoomed = false; renderNetwork(); };
ACTIONS.netKind = (el) => { SB.net.kinds[el.dataset.k] = !SB.net.kinds[el.dataset.k]; Net.userZoomed = false; renderNetwork(); };
ACTIONS.netColour = () => { SB.net.colour = SB.net.colour === 'cluster' ? 'kind' : 'cluster'; renderNetwork(); };
ACTIONS.netMin = () => { SB.net.minCount = SB.net.minCount >= 3 ? 1 : SB.net.minCount + 1; Net.userZoomed = false; renderNetwork(); };
ACTIONS.netMinLink = () => { SB.net.minLink = SB.net.minLink >= 3 ? 1 : SB.net.minLink + 1; Net.userZoomed = false; renderNetwork(); };
ACTIONS.netEgo = () => { if (!SB.selected || SB.selected.kind === 'cluster') { toast('Select a node first; the neighbourhood view keeps what sits within two steps of it.'); return; } SB.net.ego = !SB.net.ego; Net.userZoomed = false; renderNetwork(); };
ACTIONS.netLayout = () => { SB.net.layout = SB.net.layout === 'timeline' ? 'organic' : 'timeline'; Net.userZoomed = false; Net.sig = ''; renderNetwork(); };
ACTIONS.netFit = () => { Net.userZoomed = false; fitGraph(true); };
ACTIONS.netShake = () => { if (Net.sim) { Net.nodes.forEach((n) => { n.x += (Math.random() - 0.5) * 60; n.y += (Math.random() - 0.5) * 60; }); Net.sim.alpha(0.9).restart(); } };
ACTIONS.clusterFocus = (el) => { SB.selected = { kind: 'cluster', id: el.dataset.id }; focusNode(el.dataset.id, true); renderSide(); $('#side').classList.add('open'); draw(); };

function initNet() {
  const c = $('#netCanvas'); Net.canvas = c; Net.ctx = c.getContext('2d'); Net.t = d3.zoomIdentity;
  const resize = () => { const r = c.parentElement.getBoundingClientRect(); if (r.width < 50 || r.height < 50) return; const dpr = window.devicePixelRatio || 1; const changed = Math.abs(r.width - Net.w) > 1 || Math.abs(r.height - Net.h) > 1; Net.w = r.width; Net.h = r.height; c.width = Net.w * dpr; c.height = Net.h * dpr; Net.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); if (Net.sim && changed) { applyLayoutForces(); if (!Net.userZoomed) scheduleFit(); } draw(); };
  Net.resize = resize; new ResizeObserver(resize).observe(c.parentElement); resize();
  Net.zoom = d3.zoom().scaleExtent([0.15, 8]).filter((ev) => !ev.button && !(ev.type === 'mousedown' && findNode(ev))).on('zoom', (ev) => { Net.t = ev.transform; if (ev.sourceEvent) Net.userZoomed = true; draw(); });
  d3.select(c).call(Net.zoom).on('dblclick.zoom', null);
  d3.select(c).call(d3.drag().container(c).subject((ev) => findNode(ev)).on('start', (ev) => { if (!Net.sim) return; if (!ev.active) Net.sim.alphaTarget(0.25).restart(); ev.subject.fx = ev.subject.x; ev.subject.fy = ev.subject.y; c.classList.add('grabbing'); })
    .on('drag', (ev) => { const [x, y] = Net.t.invert([ev.x, ev.y]); ev.subject.fx = x; ev.subject.fy = y; })
    .on('end', (ev) => { if (Net.sim && !ev.active) Net.sim.alphaTarget(0); ev.subject.fx = null; ev.subject.fy = null; c.classList.remove('grabbing'); }));
  c.addEventListener('mousemove', (ev) => { const n = findNode(ev); if (n !== Net.hover) { Net.hover = n; draw(); } const tip = $('#netTip'); if (n) { tip.style.display = 'block'; tip.style.left = Math.min(ev.offsetX + 14, Net.w - 270) + 'px'; tip.style.top = ev.offsetY + 14 + 'px'; const cl = n.cluster && Net.clusters.get(n.cluster); tip.innerHTML = n.kind === 'entry' ? `<b>${esc(n.label)}</b>${fmtShort(n.e.date)} · ${TYPE_LABEL[n.e.type]}${effMood(n.e) != null ? ' · mood ' + fmtMood(effMood(n.e)) : ''}${cl ? `<br><span class="muted">in “${esc(cl.name)}”</span>` : ''}` : `<b>${esc(n.label)}</b>${KIND_LABEL[n.kind]} · ${n.n} ${n.n === 1 ? 'entry' : 'entries'}${n.mood != null ? ' · mood ' + fmtMood(n.mood) : ''}${cl && cl.id !== n.id ? `<br><span class="muted">constellation “${esc(cl.name)}”</span>` : ''}`; } else tip.style.display = 'none'; });
  c.addEventListener('mouseleave', () => { Net.hover = null; $('#netTip').style.display = 'none'; draw(); });
  c.addEventListener('click', (ev) => { const n = findNode(ev); if (!n) { if (SB.net.ego) return; return; } SB.selected = n.kind === 'entry' ? { kind: 'entry', id: n.id } : { kind: n.kind, id: n.kind === 'goal' ? n.gid : n.label }; renderSide(); $('#side').classList.add('open'); draw(); });
}
function findNode(ev) {
  const r = Net.canvas.getBoundingClientRect(); const src = ev.sourceEvent || ev; if (src.clientX == null) return null; const sx = src.clientX - r.left, sy = src.clientY - r.top;
  const [x, y] = Net.t.invert([sx, sy]); let best = null, bd = Infinity;
  for (const n of Net.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < n.r + 6 / Net.t.k && d < bd) { bd = d; best = n; } }
  return best;
}
function graphSignature() { return [SB.entries.length, SB.entries[0] && SB.entries[0].updatedAt, SB.entries.reduce((s, e) => s + ((e.links || []).length), 0), JSON.stringify(SB.net), SB.goals.length, SB.net.ego ? selectedKey() : '', document.documentElement.dataset.theme || '', isLightTheme()].join('|'); }
function windowEntries() { const today = new Date(); return SB.entries.filter((e) => !SB.net.days || daysBetween(fromKey(e.date), today) <= SB.net.days); }

function buildGraph() {
  const sig = graphSignature(); if (sig === Net.sig) { draw(); return; } Net.sig = sig; readPalette();
  for (const n of Net.nodes) Net.pos.set(n.id, { x: n.x, y: n.y });
  const list = windowEntries(); const K = SB.net.kinds; const cs = clusterSummary(list, K); Net.summary = cs;
  const clusterOf = new Map(); const clusters = new Map();
  for (const c of cs.clusters) { clusters.set(c.id, { ...c, color: c.slot >= 0 ? Net.pal.clusters[c.slot] : Net.pal.other }); for (const m of c.members) clusterOf.set(m.id, c.id); }
  const nodes = [], links = [], byKey = new Map();
  const backdropIds = new Set(cs.backdrop.map((x) => x.id));
  for (const [id, cn] of cs.nodes) { if (cn.n < SB.net.minCount) continue; const n = { id, kind: cn.kind, label: cn.label, gid: cn.gid, n: cn.n, r: 5 + Math.min(18, Math.sqrt(cn.n) * 2.6), entries: cn.entries, cluster: clusterOf.get(id), backdrop: backdropIds.has(id), mood: mean(cn.entries.map((eid) => entry(eid)).filter(Boolean).map(effMood)) }; byKey.set(id, n); nodes.push(n); }
  const entryNodes = new Map();
  if (K.entry) {
    for (const e of list) {
      const cons = []; const add = (kind, label, gid) => { const k = kind + ':' + slug(gid || label); if (byKey.has(k)) cons.push(byKey.get(k)); };
      for (const t of e.themes || []) add('theme', t); for (const t of e.people || []) add('person', t); for (const t of e.projects || []) add('project', t); for (const g of e.goals || []) add('goal', goalLabel(g), g);
      const tally = new Map(); for (const c of cons) if (c.cluster) tally.set(c.cluster, (tally.get(c.cluster) || 0) + 1); let cl = null, bw = 0; for (const [c, w] of tally) if (w > bw) { cl = c; bw = w; }
      const n = { id: e.id, kind: 'entry', label: e.title || cut(e.text, 50), e, r: 4.5 + Math.min(3, (e.links || []).filter((l) => l.status === 'accepted').length), cons, cluster: cl }; nodes.push(n); entryNodes.set(e.id, n);
      for (const c of [...new Set(cons)]) links.push({ source: n.id, target: c.id, kind: 'ec' });
    }
    for (const e of list) for (const l of e.links || []) { if (l.status === 'rejected' || !entryNodes.has(l.to) || !entryNodes.has(e.id)) continue; links.push({ source: e.id, target: l.to, kind: 'ee', status: l.status, reason: l.reason }); }
  } else {
    for (const [k, w] of cs.w) { if (w < SB.net.minLink) continue; const [a, b] = k.split('|'); if (byKey.has(a) && byKey.has(b)) links.push({ source: a, target: b, kind: 'cc', w }); }
  }
  let keepNodes = nodes, keepLinks = links;
  if (SB.net.ego && selectedKey() && nodes.some((n) => n.id === selectedKey())) {
    const adj = new Map(); for (const l of links) { const a = typeof l.source === 'object' ? l.source.id : l.source, b = typeof l.target === 'object' ? l.target.id : l.target; if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a).add(b); adj.get(b).add(a); }
    const keep = new Set([selectedKey()]); for (const a of adj.get(selectedKey()) || []) { keep.add(a); for (const b of adj.get(a) || []) keep.add(b); }
    keepNodes = nodes.filter((n) => keep.has(n.id)); keepLinks = links.filter((l) => keep.has(typeof l.source === 'object' ? l.source.id : l.source) && keep.has(typeof l.target === 'object' ? l.target.id : l.target));
  }
  for (const n of keepNodes) { const p = Net.pos.get(n.id); if (p) { n.x = p.x; n.y = p.y; } else { n.x = Net.w / 2 + (Math.random() - 0.5) * Net.w * 0.6; n.y = Net.h / 2 + (Math.random() - 0.5) * Net.h * 0.6; } }
  Net.nodes = keepNodes; Net.links = keepLinks; Net.clusters = clusters; $('#netEmpty').hidden = keepNodes.length > 0;
  const nc = $('#netCount'); if (nc) nc.textContent = keepNodes.length ? `${keepNodes.length} node${keepNodes.length === 1 ? '' : 's'} · ${keepLinks.length} link${keepLinks.length === 1 ? '' : 's'} · ${clusters.size} constellation${clusters.size === 1 ? '' : 's'}` : '';
  renderLegend();
  if (Net.sim) Net.sim.stop();
  Net.sim = d3.forceSimulation(keepNodes)
    .force('link', d3.forceLink(keepLinks).id((d) => d.id).distance((l) => (l.kind === 'ee' ? 50 : l.kind === 'cc' ? 80 : 30 + l.target.r)).strength((l) => (l.kind === 'cc' ? Math.min(0.8, 0.15 + l.w * 0.12) : l.kind === 'ee' ? 0.5 : 0.35)))
    .force('charge', d3.forceManyBody().strength((d) => (d.kind === 'entry' ? -14 : -70 - d.r * 6)).distanceMax(460))
    .force('cluster', forceCluster(0.09))
    .force('collide', d3.forceCollide((d) => d.r + (d.kind === 'entry' ? 3 : 7)).iterations(2).strength(0.9))
    .alphaDecay(0.02).velocityDecay(0.42).on('tick', draw).on('end', () => { if (!Net.userZoomed) fitGraph(true); });
  applyLayoutForces();
  if (REDUCED) { Net.sim.stop(); for (let i = 0; i < 320; i++) Net.sim.tick(); draw(); if (!Net.userZoomed) fitGraph(false); }
  else if (!Net.userZoomed) scheduleFit();
}
/* gathers each constellation around its own centre and keeps constellations apart */
function forceCluster(strength) {
  let nodes = [];
  function force(alpha) {
    const cents = new Map();
    for (const n of nodes) { if (!n.cluster) continue; const c = cents.get(n.cluster) || { x: 0, y: 0, w: 0, n: 0 }; const w = n.kind === 'entry' ? 1 : 3; c.x += n.x * w; c.y += n.y * w; c.w += w; c.n++; cents.set(n.cluster, c); }
    for (const c of cents.values()) { c.x /= c.w; c.y /= c.w; c.r = 40 + 9 * Math.sqrt(c.n); }
    for (const n of nodes) { const c = n.cluster && cents.get(n.cluster); if (!c) continue; const k = strength * alpha * (n.kind === 'entry' ? 1 : 1.3); n.vx += (c.x - n.x) * k; n.vy += (c.y - n.y) * k; }
    const list = [...cents.entries()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ia, a] = list[i], [ib, b] = list[j]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.max(1, Math.hypot(dx, dy)); const min = a.r + b.r; if (d >= min) continue;
      const push = ((min - d) / d) * alpha * 0.06; for (const n of nodes) { if (n.cluster === ia) { n.vx -= dx * push; n.vy -= dy * push; } else if (n.cluster === ib) { n.vx += dx * push; n.vy += dy * push; } }
    }
  }
  force.initialize = (ns) => { nodes = ns; };
  return force;
}
function applyLayoutForces() {
  if (!Net.sim) return; const w = Net.w, h = Net.h;
  if (SB.net.layout === 'timeline') {
    const es = Net.nodes.filter((n) => n.kind === 'entry'); const ts = es.length ? es.map((n) => n.e.ts) : Net.nodes.flatMap((n) => (n.entries || []).map((id) => entry(id)).filter(Boolean).map((e) => e.ts));
    const lo = Math.min(...ts), hi = Math.max(...ts); const x = (t) => (hi > lo ? 70 + ((t - lo) / (hi - lo)) * (w - 140) : w / 2);
    const target = (n) => { if (n.kind === 'entry') return x(n.e.ts); const its = (n.entries || []).map((id) => entry(id)).filter(Boolean); return its.length ? mean(its.map((e) => x(e.ts))) : w / 2; };
    Net.sim.force('center', null).force('x', d3.forceX(target).strength((d) => (d.kind === 'entry' ? 0.7 : 0.25))).force('y', d3.forceY(h / 2).strength(0.06));
  } else {
    Net.sim.force('center', d3.forceCenter(w / 2, h / 2).strength(0.04)).force('x', d3.forceX(w / 2).strength(0.025)).force('y', d3.forceY(h / 2).strength(0.035));
  }
  Net.sim.alpha(Math.max(Net.sim.alpha(), 0.5)).restart();
}
function renderLegend() {
  const n = SB.net; let html = '';
  if (n.colour === 'cluster') { const top = [...Net.clusters.values()].filter((c) => c.slot >= 0 && c.members.length).slice(0, 8); html = top.map((c) => `<span><i style="--c:${c.color}"></i>${esc(cut(c.name, 22))}</span>`).join('') + (Net.clusters.size > 8 ? `<span><i style="--c:${Net.pal.other}"></i>other</span>` : ''); }
  else html = `<span><i style="--c:var(--k-theme)"></i>theme</span><span><i style="--c:var(--k-person)"></i>person</span><span><i style="--c:var(--k-project)"></i>project</span><span><i style="--c:var(--k-goal)"></i>goal</span>`;
  html += `<span class="muted">shapes: ● theme ■ person ◆ project ⬢ goal · small dots are entries · <i style="--c:${Net.pal.accent}"></i>dashed ring: a backdrop theme that runs through most entries</span>`; $('#netLegend').innerHTML = html;
}
let fitTimer = null;
function scheduleFit() { clearTimeout(fitTimer); fitTimer = setTimeout(() => fitGraph(true), 900); }
function fitGraph(animate, subset) {
  const ns = subset && subset.length ? subset : Net.nodes; if (!ns.length) return; const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
  const x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50;
  const k = clamp(Math.min(Net.w / (x1 - x0), Net.h / (y1 - y0)), 0.15, ns.length < 6 ? 1.6 : 2.5); const t = d3.zoomIdentity.translate(Net.w / 2 - k * (x0 + x1) / 2, Net.h / 2 - k * (y0 + y1) / 2).scale(k);
  const sel = d3.select(Net.canvas); if (animate && !REDUCED) sel.transition().duration(500).call(Net.zoom.transform, t); else sel.call(Net.zoom.transform, t);
}
function focusNode(id, isCluster) {
  if (isCluster) { const members = Net.nodes.filter((n) => n.cluster === id); if (!members.length) { toast('That constellation is not in the current window.'); return; } Net.userZoomed = true; fitGraph(true, members); return; }
  const n = Net.nodes.find((x) => x.id === id); if (!n) { toast('Not in the current window; widen the time range.'); return; }
  SB.selected = n.kind === 'entry' ? { kind: 'entry', id: n.id } : { kind: n.kind, id: n.kind === 'goal' ? n.gid : n.label };
  const k = 1.8; const t = d3.zoomIdentity.translate(Net.w / 2 - k * n.x, Net.h / 2 - k * n.y).scale(k); const sel = d3.select(Net.canvas); Net.userZoomed = true;
  if (REDUCED) sel.call(Net.zoom.transform, t); else sel.transition().duration(600).call(Net.zoom.transform, t); renderSide();
}
function selectedKey() { const s = SB.selected; if (!s || s.kind === 'cluster') return null; return s.kind === 'entry' ? s.id : s.kind + ':' + slug(s.id); }
function shapePath(ctx, n) {
  const { x, y, r } = n; ctx.beginPath();
  if (n.kind === 'person') { const s = r * 0.9; ctx.roundRect ? ctx.roundRect(x - s, y - s, 2 * s, 2 * s, s * 0.3) : ctx.rect(x - s, y - s, 2 * s, 2 * s); }
  else if (n.kind === 'project') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (n.kind === 'goal') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
  else ctx.arc(x, y, r, 0, Math.PI * 2);
}
function nodeColor(n) {
  const pal = Net.pal; if (n.backdrop) return pal.accent; if (SB.net.colour === 'cluster') { const c = n.cluster && Net.clusters.get(n.cluster); return c ? c.color : pal.other; }
  return n.kind === 'entry' ? pal['t-' + (TYPES.includes(n.e.type) ? n.e.type : 'note')] : pal['k-' + n.kind];
}
function draw() {
  const ctx = Net.ctx; if (!ctx) return; const { w, h, t, pal } = Net; ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(t.x, t.y); ctx.scale(t.k, t.k);
  const selKey = selectedKey(); const selCluster = SB.selected && SB.selected.kind === 'cluster' ? SB.selected.id : null; const hov = Net.hover; const focus = selKey || (hov && hov.id); const nb = new Set();
  if (focus) { nb.add(focus); for (const l of Net.links) { const a = l.source.id, b = l.target.id; if (a === focus) nb.add(b); if (b === focus) nb.add(a); } }
  // constellation hulls: smooth, rounded, with a soft halo
  const placed = [];
  const free = (x, y, w, h) => { for (const r of placed) if (!(x > r[0] + r[2] || x + w < r[0] || y > r[1] + r[3] || y + h < r[1])) return false; placed.push([x, y, w, h]); return true; };
  if (SB.net.colour === 'cluster' || selCluster) {
    const curve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.7)).context(ctx);
    for (const c of Net.clusters.values()) {
      const members = Net.nodes.filter((n) => n.cluster === c.id); if (members.length < 2 || (c.slot < 0 && !selCluster)) continue; if (selCluster && c.id !== selCluster) continue;
      const pad = 16 / Math.sqrt(t.k); const pts = members.flatMap((n) => { const r = n.r + pad; return [[n.x - r, n.y], [n.x + r, n.y], [n.x, n.y - r], [n.x, n.y + r], [n.x - r * 0.72, n.y - r * 0.72], [n.x + r * 0.72, n.y + r * 0.72], [n.x - r * 0.72, n.y + r * 0.72], [n.x + r * 0.72, n.y - r * 0.72]]; });
      const hull = d3.polygonHull(pts); if (!hull) continue;
      ctx.beginPath(); curve(hull); ctx.lineJoin = 'round'; ctx.strokeStyle = c.color; ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.05; ctx.lineWidth = 36 / t.k; ctx.stroke(); ctx.globalAlpha = 0.07; ctx.fill(); ctx.globalAlpha = 0.22; ctx.lineWidth = 1.2 / t.k; ctx.stroke();
      const top = hull.reduce((a, q) => (q[1] < a[1] ? q : a)); const size = 10.5 / t.k; ctx.font = `700 ${size}px "Bricolage Grotesque", system-ui, sans-serif`; try { ctx.letterSpacing = '0.12em'; } catch {}
      const label = c.name.toUpperCase(); const tw = ctx.measureText(label).width; const lx = top[0] - tw / 2, ly = top[1] - 30 / t.k;
      if (free(lx - 4 / t.k, ly - size, tw + 8 / t.k, size * 1.6)) { ctx.globalAlpha = 0.85; ctx.fillStyle = pal.ground; ctx.fillRect(lx - 5 / t.k, ly - size * 1.05, tw + 10 / t.k, size * 1.5); ctx.globalAlpha = 0.95; ctx.fillStyle = c.color; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, lx, ly); }
      try { ctx.letterSpacing = '0px'; } catch {} ctx.globalAlpha = 1;
    }
  }
  for (const l of Net.links) {
    const dim = focus && !(nb.has(l.source.id) && nb.has(l.target.id) && (l.source.id === focus || l.target.id === focus));
    ctx.beginPath(); ctx.moveTo(l.source.x, l.source.y); ctx.lineTo(l.target.x, l.target.y);
    if (l.kind === 'ee') { ctx.strokeStyle = pal.accent; ctx.globalAlpha = dim ? 0.1 : 0.75; ctx.lineWidth = 1.3 / t.k; ctx.setLineDash(l.status === 'proposed' ? [4 / t.k, 4 / t.k] : []); }
    else if (l.kind === 'cc') { ctx.strokeStyle = pal.ink; ctx.globalAlpha = dim ? 0.04 : Math.min(0.45, 0.08 + l.w * 0.06); ctx.lineWidth = (0.6 + Math.min(4, l.w * 0.5)) / t.k; ctx.setLineDash([]); }
    else { ctx.strokeStyle = pal.ink; ctx.globalAlpha = dim ? 0.03 : 0.11; ctx.lineWidth = 0.7 / t.k; ctx.setLineDash([]); }
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (const n of Net.nodes) {
    const color = nodeColor(n); const dim = (focus && !nb.has(n.id)) || (selCluster && n.cluster !== selCluster); const isFocus = n.id === focus;
    ctx.globalAlpha = dim ? 0.15 : (n.kind === 'entry' ? 0.9 : 1); shapePath(ctx, n); ctx.fillStyle = color;
    if (isFocus || (hov && hov.id === n.id)) { ctx.shadowColor = color; ctx.shadowBlur = 18 / t.k; } else ctx.shadowBlur = 0;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = (n.kind === 'entry' ? 0.8 : 1.4) / t.k; ctx.strokeStyle = pal.ground; ctx.stroke();
    if (n.backdrop) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5 / t.k, 0, Math.PI * 2); ctx.strokeStyle = pal.accent; ctx.globalAlpha = dim ? 0.15 : 0.55; ctx.lineWidth = 1.2 / t.k; ctx.setLineDash([3 / t.k, 3 / t.k]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (isFocus) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4 / t.k, 0, Math.PI * 2); ctx.strokeStyle = pal.accent; ctx.lineWidth = 1.5 / t.k; ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.textBaseline = 'middle';
  const small = Net.nodes.length <= 16; const sel = Net.nodes.filter((n) => n.id === focus); const concepts = Net.nodes.filter((n) => n.kind !== 'entry' && n.id !== focus).sort((a, b) => b.n - a.n); const entries = Net.nodes.filter((n) => n.kind === 'entry' && n.id !== focus);
  for (const n of [...sel, ...concepts, ...entries]) {
    const forced = n.id === focus || (hov && hov.id === n.id);
    const want = forced || (n.kind !== 'entry' ? (small || n.n >= 2 || t.k > 1.2 || nb.has(n.id)) : (small || t.k > 2.4 || (focus && nb.has(n.id))));
    if (!want) continue; const dim = (focus && !nb.has(n.id)) || (selCluster && n.cluster !== selCluster); if (dim) continue;
    const size = (n.kind === 'entry' ? 10.5 : 11.5 + Math.min(4, n.r / 4)) / t.k; ctx.font = `${n.kind === 'entry' ? 400 : 600} ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
    const label = n.kind === 'entry' ? cut(n.label, 34) : n.label; const tw = ctx.measureText(label).width; const x = n.x + n.r + 5 / t.k, y = n.y;
    if (!forced && !free(x - 2 / t.k, y - size * 0.75, tw + 4 / t.k, size * 1.5)) continue;
    ctx.fillStyle = pal.ground; ctx.globalAlpha = 0.78; ctx.fillRect(x - 3 / t.k, y - size * 0.72, tw + 6 / t.k, size * 1.44); ctx.globalAlpha = 1;
    ctx.fillStyle = n.kind === 'entry' ? pal.muted : pal.ink; ctx.fillText(label, x, y);
  }
  ctx.restore();
}

/* ─── constellation panel: the readable version of the graph ─── */
function renderClusterPanel() {
  const root = $('#netClusters'); if (!root) return; const cs = Net.summary; if (!cs || !cs.clusters.length) { root.innerHTML = ''; return; }
  const overall = cs.overall; const top = cs.clusters.filter((c) => c.size >= 1).slice(0, 8);
  const bd = cs.backdrop || [];
  root.innerHTML = `<div class="panel" style="margin-top:14px"><h3>Constellations in this window</h3><div class="sub">Groups of themes, people, projects and goals that keep appearing in the same entries. Mood is the mean of the entries in the group against your overall ${fmtMood(overall)}; growth compares the last 30 days with the 30 before.${cs.clusters.length <= 1 && windowEntries().length < 8 ? ' With this few entries one constellation is expected; the structure appears as themes multiply.' : ''}</div>
  ${bd.length ? `<div class="banner" style="margin:0 0 12px"><span>Runs through most entries, so it is kept out of the grouping and shown with a gold ring:</span>${bd.map((x) => `<button class="tag" style="--c:var(--accent)" data-action="select" data-kind="theme" data-id="${esc(x.label)}"><i></i>${esc(x.label)} <span class="mono muted">${x.n} of ${windowEntries().length}</span></button>`).join('')}</div>` : ''}
  <div class="clusters">${top.map((c) => { const col = c.slot >= 0 ? Net.pal.clusters[c.slot] : Net.pal.other; const growth = c.before === 0 && c.recent > 0 ? 'new' : c.before === 0 ? 'quiet' : c.recent > c.before * 1.3 ? 'growing' : c.recent < c.before * 0.7 ? 'fading' : 'steady'; return `<div class="cluster"><div class="row"><i class="sw" style="--c:${col};width:12px;height:12px"></i><b class="serif">${esc(c.name)}</b><span class="badge soft">${growth}</span><span style="flex:1"></span><span class="mono small">${c.size} ${c.size === 1 ? 'entry' : 'entries'}</span></div><div class="tags">${c.members.slice(0, 9).map((m) => `<button class="tag" style="--c:${kindVar(m.kind)}" data-action="select" data-kind="${m.kind}" data-id="${esc(m.kind === 'goal' ? m.gid : m.label)}"><i></i>${esc(m.label)} <span class="mono muted">${m.n}</span></button>`).join('')}${c.members.length > 9 ? `<span class="muted small">+${c.members.length - 9} more</span>` : ''}</div><div class="row small"><span class="muted">mood with it</span><b class="mono" style="color:${c.moodDiff == null ? 'inherit' : c.moodDiff < -0.4 ? 'var(--bad)' : c.moodDiff > 0.4 ? 'var(--good)' : 'inherit'}">${fmtMood(c.mood)}</b>${c.moodDiff != null && Math.abs(c.moodDiff) >= 0.4 ? `<span class="muted">(${c.moodDiff > 0 ? 'above' : 'below'} overall)</span>` : ''}<span style="flex:1"></span><button class="btn ghost sm" data-action="clusterFocus" data-id="${esc(c.id)}">Focus</button></div></div>`; }).join('')}</div></div>`;
}
