/* ═══════════════════════════ Second Brain · core ═══════════════════════════ */
'use strict';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'e') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => String(n).padStart(2, '0');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const TYPES = ['journal', 'idea', 'task', 'goal', 'question', 'feeling', 'decision', 'note'];
const TYPE_LABEL = { journal: 'Journal', idea: 'Idea', task: 'Task', goal: 'Goal', question: 'Question', feeling: 'Feeling', decision: 'Decision', note: 'Note' };
const MOOD_LABEL = { '-2': 'rough', '-1': 'low', '0': 'okay', '1': 'good', '2': 'great' };
const KIND_LABEL = { theme: 'Theme', person: 'Person', project: 'Project', goal: 'Goal', entry: 'Entry' };
const STAGES = ['Problem', 'What I know', 'Options', 'How I feel', 'Decision', 'Next step'];
const DEFAULT_SETTINGS = { instructions: '', filingTier: 'quick', weekStart: 1, headsupAuto: false };

/* ─────────────── dates (local time throughout) ─────────────── */
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const timeKey = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysBetween = (a, b) => Math.round((fromKey(dateKey(b)) - fromKey(dateKey(a))) / 86400000);
function isoWeek(d) { // returns {year, week, key}
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((x - y0) / 86400000 + 1) / 7);
  return { year: x.getUTCFullYear(), week, key: `${x.getUTCFullYear()}-W${pad2(week)}` };
}
const weekKey = (d) => isoWeek(d).key;
const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
function weekRange(key) { // Monday..Sunday of an ISO week key
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(y, 0, 4); const dow = jan4.getDay() || 7;
  const mon = addDays(jan4, 1 - dow + (w - 1) * 7); return { from: mon, to: addDays(mon, 6) };
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtLong = (d) => `${WD_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const fmtShort = (k) => { const d = fromKey(k); return `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const fmtDay = (k) => { const d = fromKey(k); const t = dateKey(); if (k === t) return 'Today'; if (k === dateKey(addDays(new Date(), -1))) return 'Yesterday'; return `${WD_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
const ago = (iso) => { const ms = Date.now() - new Date(iso).getTime(); const d = Math.floor(ms / 86400000); if (d < 1) return 'today'; if (d === 1) return '1 day'; if (d < 30) return `${d} days`; const m = Math.floor(d / 30); return m === 1 ? '1 month' : `${m} months`; };

/* ─────────────── state ─────────────── */
const SB = {
  caps: { db: null, user: null, sample: null, downloads: null, assets: null, resolved: false },
  uid: null, demo: false, examples: false,
  entries: [], byId: new Map(), goals: [], threads: [], digests: new Map(), insights: new Map(), headsup: new Map(), settings: clone(DEFAULT_SETTINGS),
  view: 'journal', selected: null, // {kind:'entry'|'theme'|..., id}
  jf: { q: '', type: '', theme: '' },
  net: { days: 90, kinds: { entry: true, theme: true, person: true, project: true, goal: true }, colour: 'cluster', minCount: 1, minLink: 1, ego: false, layout: 'organic' },
  think: { current: null }, expanded: new Set(),
  review: { week: null, tab: 'week' },
  capture: { type: '', mood: null, energy: null, attachments: [], replyTo: null },
  trash: [], older: [], hasOlder: false, oldestTs: null, readonly: false, mirrorAt: null,
  pendingFiling: new Set(), unsub: [], loaded: { entries: false, goals: false, threads: false, digests: false, insights: false, headsup: false, settings: false },
};
const entry = (id) => SB.byId.get(id) || null;
const effMood = (e) => (e.mood && e.mood.user != null ? e.mood.user : (e.mood ? e.mood.ai : null));
const effEnergy = (e) => (e.energy && e.energy.user != null ? e.energy.user : (e.energy ? e.energy.ai : null));
const moodVar = (m) => (m == null ? 'var(--m-none)' : `var(--m${m < 0 ? '-' + Math.abs(m) : m})`);
const typeVar = (t) => `var(--t-${TYPES.includes(t) ? t : 'note'})`;
const kindVar = (k) => `var(--k-${k})`;
const slug = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/* ─────────────── toast + modal + confirm ─────────────── */
function toast(msg, kind = '', ms = 3800) {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.innerHTML = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms); return t;
}
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('open'); const f = $('#modalBox').querySelector('textarea, input, select, button'); if (f) f.focus(); }
function closeModal() { $('#modal').classList.remove('open'); $('#modalBox').innerHTML = ''; }
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal(); });

/* ─────────────── error copy ─────────────── */
const SAMPLE_COPY = {
  not_granted: window.LocalBridge ? 'No working API key. Add one under Settings → Claude API; filing stays manual meanwhile.' : 'Claude is not allowed for this page. Filing stays manual; you can still fill in the fields.',
  sampling_disabled: 'Claude is not available on this account.', rate_limited: 'Claude is busy or your usage limit was reached. Try again in a minute.',
  session_expired: window.LocalBridge ? 'The API key was rejected. Check it under Settings → Claude API.' : 'Your session expired. Sign in to claude.ai again.', refused: 'Claude declined to process this text.', invalid_json: 'Claude’s answer could not be read. Try again or fill the fields by hand.',
  prompt_too_large: 'That is too much text for one call. Split the entry.', upstream_error: 'A connection problem interrupted Claude. Try again.', cancelled: 'Stopped.',
  empty_completion: 'Claude returned nothing. Try again.', not_declared: 'This page no longer has access to Claude.', capability_disabled: 'Claude is not usable in this view.', capability_removed: 'Claude is not usable in this view.',
};
const sampleCopy = (e) => SAMPLE_COPY[e && e.code] || SAMPLE_COPY.upstream_error;
const DB_COPY = { quota_exceeded: 'Storage is full. Export and prune old entries.', resource_exhausted: 'Too many writes at once; slow down a little.', revoked: 'Access to this brain was withdrawn while the page was open. Reload.', invalid_argument: 'That could not be saved (invalid data).', unavailable: 'The store is briefly unavailable; your change will be retried.' };
const dbCopy = (e) => DB_COPY[e && e.code] || 'Could not save right now.';

/* ─────────────── write queue (one write at a time per document) ─────────────── */
const queues = new Map();
function writeDoc(coll, id, data) {
  if (!SB.caps.db) { return Promise.resolve(); }
  const key = coll + '/' + id; const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const ref = SB.caps.db.collection(coll).doc(id);
    try { await ref.set(data); }
    catch (e) { if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 600 + Math.random() * 600)); await ref.set(data); } else { toast(dbCopy(e), 'bad'); throw e; } }
  });
  queues.set(key, next); return next;
}
function deleteDoc(coll, id) {
  if (!SB.caps.db) return Promise.resolve();
  return SB.caps.db.collection(coll).doc(id).delete().catch((e) => { toast(dbCopy(e), 'bad'); throw e; });
}

/* ─────────────── local write-through (so the UI never waits for the round trip) ─────────────── */
function upsertLocal(list, byId, obj) { const i = list.findIndex((x) => x.id === obj.id); if (i >= 0) list[i] = obj; else list.push(obj); if (byId) byId.set(obj.id, obj); }
async function saveEntry(e) {
  e.updatedAt = new Date().toISOString();
  if (e.example) { toast('That is an example card. Write your own entry above and it becomes real.'); return; }
  if (SB.readonly) { toast('This is an offline copy; changes cannot be saved until the store is back.', 'bad'); return; }
  if (e.deleted) { SB.entries = SB.entries.filter((x) => x.id !== e.id); SB.byId.delete(e.id); upsertLocal(SB.trash, null, e); }
  else { SB.trash = SB.trash.filter((x) => x.id !== e.id); upsertLocal(SB.entries, SB.byId, e); SB.entries.sort((a, b) => b.ts - a.ts); }
  scheduleRender(); Mirror.schedule();
  await writeDoc('entries', e.id, e);
}
// deletion is soft: the card moves to the trash and can be restored; only 'Delete forever' in Settings removes the document
async function removeEntry(id) { const e = clone(entry(id)); if (!e) return; e.deleted = true; e.deletedAt = new Date().toISOString(); if (SB.selected && SB.selected.id === id) SB.selected = null; await saveEntry(e); }
async function restoreEntry(id) { const e = clone(SB.trash.find((x) => x.id === id)); if (!e) return; delete e.deleted; delete e.deletedAt; await saveEntry(e); }
async function purgeEntry(id) { SB.trash = SB.trash.filter((x) => x.id !== id); scheduleRender(); await deleteDoc('entries', id); Mirror.schedule(); }
async function saveGoal(g) { g.updatedAt = new Date().toISOString(); upsertLocal(SB.goals, null, g); scheduleRender(); Mirror.schedule(); await writeDoc('goals', g.id, g); }
async function saveThread(t) { t.updatedAt = new Date().toISOString(); upsertLocal(SB.threads, null, t); SB.threads.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); scheduleRender(); Mirror.schedule(); await writeDoc('threads', t.id, t); }
async function saveDigest(d) { SB.digests.set(d.key, d); scheduleRender(); await writeDoc('digests', d.key, d); }
async function saveInsight(d) { SB.insights.set(d.key, d); scheduleRender(); await writeDoc('insights', d.key, d); }
async function saveHeadsup(d) { SB.headsup.set(d.key, d); scheduleRender(); await writeDoc('headsup', d.key, d); }
async function saveSettings(s) { SB.settings = s; scheduleRender(); Mirror.schedule(); await writeDoc('settings', 'main', s); }

/* ─────────────── boot ─────────────── */
let renderTimer = null;
function scheduleRender() { if (renderTimer) return; renderTimer = setTimeout(() => { renderTimer = null; renderAll(); }, 40); }

async function boot() {
  renderShell(); route(location.hash); renderAll();
  try { const d = localStorage.getItem('sb.draft'); if (d) $('#capText').value = d; } catch {}
  SB.local = !!window.LocalBridge;
  const use = (n) => (window.LocalBridge ? Promise.resolve(window.LocalBridge[n] || null) : window.claude && typeof window.claude.use === 'function' ? window.claude.use(n).catch(() => null) : Promise.resolve(null));
  const [db, user, sample, downloads, assets] = await Promise.all([use('db'), use('user'), use('sample'), use('downloads'), use('assets')]);
  Object.assign(SB.caps, { db, user, sample, downloads, assets, resolved: true });
  if (user) { try { SB.uid = await user.id(); } catch {} }
  if (assets) $('#capImg').hidden = false;
  if (db) { subscribeAll(); }
  else if (window.claude && (await Mirror.load())) { SB.readonly = true; markLoaded(); toast('The store did not answer, so this is your offline copy from ' + (SB.mirrorAt ? fmtShort(SB.mirrorAt.slice(0, 10)) : 'earlier') + '. Reading works; writing waits.', 'bad', 9000); }
  else { SB.demo = true; loadExamples(); markLoaded(); }
  renderAll();
}
function markLoaded() { Object.keys(SB.loaded).forEach((k) => (SB.loaded[k] = true)); }
function subscribeAll() {
  const db = SB.caps.db; const onErr = (what) => (e) => { console.warn(what, e); if (e && e.code === 'revoked') toast(DB_COPY.revoked, 'bad', 8000); };
  SB.unsub.push(db.collection('entries').orderBy('ts', 'desc').limit(1000).onSnapshot((snap) => {
    const all = snap.docs.map((d) => d.data()).filter((x) => x && x.id);
    SB.hasOlder = snap.docs.length >= 1000; SB.oldestTs = all.length ? Math.min(...all.map((e) => e.ts || 0)) : null;
    const live = new Set(all.map((e) => e.id)); const olderKeep = SB.older.filter((e) => !live.has(e.id));
    const docs = [...all, ...olderKeep].filter((e) => !e.deleted); SB.trash = [...all, ...olderKeep].filter((e) => e.deleted).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
    SB.entries = docs.sort((a, b) => b.ts - a.ts); SB.byId = new Map(SB.entries.map((e) => [e.id, e])); Mirror.schedule();
    SB.loaded.entries = true; if (SB.examples && docs.length) { SB.goals = SB.goals.filter((g) => !g.example); SB.threads = SB.threads.filter((t) => !t.example); SB.examples = false; } else if (SB.examples && !docs.length) { loadExamples(true); } scheduleRender();
  }, onErr('entries')));
  SB.unsub.push(db.collection('goals').onSnapshot((snap) => { const docs = snap.docs.map((d) => d.data()).filter((x) => x && x.id); SB.loaded.goals = true; if (SB.examples && !docs.length) return; SB.goals = docs; scheduleRender(); }, onErr('goals')));
  SB.unsub.push(db.collection('threads').orderBy('updatedAt', 'desc').limit(200).onSnapshot((snap) => { const docs = snap.docs.map((d) => d.data()).filter((x) => x && x.id); SB.loaded.threads = true; if (SB.examples && !docs.length) return; SB.threads = docs; scheduleRender(); }, onErr('threads')));
  SB.unsub.push(db.collection('digests').onSnapshot((snap) => { SB.digests = new Map(snap.docs.map((d) => [d.id, d.data()])); SB.loaded.digests = true; scheduleRender(); Mirror.schedule(); }, onErr('digests')));
  SB.unsub.push(db.collection('insights').onSnapshot((snap) => { SB.insights = new Map(snap.docs.map((d) => [d.id, d.data()])); SB.loaded.insights = true; scheduleRender(); }, onErr('insights')));
  SB.unsub.push(db.collection('headsup').orderBy('key', 'desc').limit(12).onSnapshot((snap) => { SB.headsup = new Map(snap.docs.map((d) => [d.id, d.data()])); SB.loaded.headsup = true; scheduleRender(); }, onErr('headsup')));
  SB.unsub.push(db.doc('settings/main').onSnapshot((snap) => { if (snap.exists) SB.settings = Object.assign(clone(DEFAULT_SETTINGS), snap.data()); SB.loaded.settings = true; scheduleRender(); }, onErr('settings')));
}

/* ─────────────── examples (shown only when the brain is empty; never written) ─────────────── */
function loadExamples(force) {
  if (SB.entries.length && !force) return; SB.examples = true;
  const D = window.SB_DEMO;   // a static demo build ships a whole fictional journal
  if (D && Array.isArray(D.entries) && D.entries.length) {
    SB.entries = D.entries.map((e) => ({ ...e, example: true })).sort((a, b) => b.ts - a.ts); SB.byId = new Map(SB.entries.map((e) => [e.id, e]));
    SB.goals = (D.goals || []).map((g) => ({ ...g, example: true })); SB.threads = (D.threads || []).map((t) => ({ ...t, example: true }));
    SB.digests = new Map((D.digests || []).map((d) => [d.key, d])); SB.insights = new Map((D.insights || []).map((d) => [d.key, d])); SB.headsup = new Map((D.headsup || []).map((d) => [d.key, d]));
    if (D.settings) SB.settings = Object.assign(clone(DEFAULT_SETTINGS), D.settings); return;
  }
  const today = new Date(); const mk = (daysAgo, time, type, text, title, mood, energy, themes, people = [], projects = [], extra = {}) => {
    const d = addDays(today, -daysAgo); const [hh, mm] = time.split(':').map(Number); d.setHours(hh, mm, 0, 0);
    return Object.assign({ id: 'ex_' + daysAgo + '_' + time.replace(':', ''), example: true, createdAt: d.toISOString(), ts: d.getTime(), date: dateKey(d), time, type, text, title, summary: '', mood: { ai: mood, user: null }, energy: { ai: energy, user: null }, themes, people, projects, goals: [], tasks: [], questions: [], links: [], followup: null, attachments: [], filing: 'done', edited: false }, extra);
  };
  const g = { id: 'ex_goal', example: true, label: 'Land a quant research role', why: 'Use the physics training on real problems, with a team.', status: 'active', createdAt: addDays(today, -40).toISOString(), checkins: [{ at: addDays(today, -9).toISOString(), note: 'Sent two applications; one referral in progress.', progress: 25 }], lastTouched: addDays(today, -9).toISOString() };
  SB.goals = [g];
  SB.entries = [
    mk(11, '22:40', 'journal', 'Long day. Spent most of it reading about look-ahead bias and felt the familiar mix of excitement and dread: the field is huge and I am late. Ran 5k in the evening, which helped more than I expected.', 'Late to a huge field', -1, 2, ['job search', 'running', 'self-doubt'], [], ['Portfolio project'], { goals: ['ex_goal'] }),
    mk(10, '08:15', 'idea', 'What if the journal itself is the dataset? Every entry tagged, moods over time, then look for the patterns I cannot see from inside a single day.', 'The journal as a dataset', 1, 4, ['journaling', 'second brain'], [], ['Second brain']),
    mk(9, '21:05', 'journal', 'Call with Dana about the referral. She said the CV is fine but a built project is what gets attention. Felt relieved to have a clear next step, and slightly exposed.', 'Clear next step', 1, 3, ['job search', 'referral'], ['Dana'], ['Portfolio project'], { goals: ['ex_goal'], tasks: [{ id: 't1', text: 'Draft the project one-pager for Dana', done: true }] }),
    mk(7, '23:30', 'feeling', 'Could not sleep. Thoughts looping about whether I chose the wrong project. Writing it down to put it somewhere.', 'Looping at midnight', -2, 1, ['sleep', 'self-doubt', 'job search'], [], [], { questions: [{ id: 'q1', text: 'Is the project original enough to matter?', resolved: false }] }),
    mk(6, '09:10', 'journal', 'Slept badly but the morning was oddly productive: wrote the data loader and a first chart. Noticed that writing the plan down the night before made starting easy.', 'Plan written, start easy', 1, 3, ['productivity', 'sleep', 'second brain'], [], ['Second brain']),
    mk(4, '19:50', 'question', 'Why do I keep postponing the hand-labelling task? It is two hours of work and I have avoided it for a week.', 'Avoiding the labels', 0, 3, ['procrastination', 'job search'], [], ['Portfolio project'], { questions: [{ id: 'q2', text: 'What exactly am I avoiding in the labelling task?', resolved: false }] }),
    mk(2, '21:20', 'journal', 'Labelled 20 pairs after dinner. Took 50 minutes, not two hours. Noted for the record: the thing I avoid is usually smaller than the avoidance.', 'Smaller than the avoidance', 2, 4, ['procrastination', 'job search', 'journaling'], [], ['Portfolio project'], { goals: ['ex_goal'], links: [{ to: 'ex_4_1950', reason: 'answers the question about postponing the labelling', status: 'accepted' }] }),
    mk(1, '07:45', 'task', 'Email Dana the one-pager and ask for one blind label as a second reader.', 'Email Dana', null, null, ['job search', 'referral'], ['Dana'], ['Portfolio project'], { tasks: [{ id: 't2', text: 'Email Dana the one-pager', done: false }, { id: 't3', text: 'Ask Dana for one blind label', done: false }] }),
  ].sort((a, b) => b.ts - a.ts);
  SB.byId = new Map(SB.entries.map((e) => [e.id, e]));
  SB.threads = [{ id: 'ex_thread', example: true, title: 'Which project to build first', problem: 'Three candidate projects, one month, and the referral depends on having something to show.', createdAt: addDays(today, -8).toISOString(), updatedAt: addDays(today, -8).toISOString(), status: 'decided', stage: 5,
    steps: [{ role: 'me', stage: 0, text: 'Three candidate projects, one month, and the referral depends on having something to show.', at: addDays(today, -8).toISOString() },
      { role: 'claude', stage: 1, text: 'What do you actually know about how long each project takes, as opposed to how long you hope it takes?', at: addDays(today, -8).toISOString() },
      { role: 'me', stage: 1, text: 'The Fed project has free data and I already scraped it. The earnings one needs weeks of parsing. The agent one I cannot estimate.', at: addDays(today, -8).toISOString() },
      { role: 'claude', stage: 2, text: 'If you had to defend the choice to Dana in one sentence, which project gives you the sentence you would be proud of?', at: addDays(today, -8).toISOString() },
      { role: 'me', stage: 4, text: 'Fed project first; the other two become stretch goals.', at: addDays(today, -8).toISOString() }],
    outcome: { decision: 'Build the Fed project first.', nextStep: 'Scaffold the repo and ingest statements this weekend.', summary: 'Chosen for free data and a clear interview story; the other two stay as stretch goals.', facts: ['Data already scraped', 'Earnings parsing is weeks of work'], options: ['Fed reader', 'Earnings reader', 'Research agent'] } }];
}

/* ─────────────── routing + shell ─────────────── */
const VIEWS = ['journal', 'network', 'patterns', 'headsup', 'think', 'review', 'settings'];
function route(hash) { const v = (hash || '').replace('#', ''); SB.view = VIEWS.includes(v) ? v : 'journal'; }
window.addEventListener('hashchange', () => { route(location.hash); renderAll(); });
function renderShell() {
  $('#topDate').innerHTML = `${fmtLong(new Date())}<br><em>${isoWeek(new Date()).key.replace('-W', ' · week ')}</em>`;
}
function setView(v) { if (!VIEWS.includes(v)) return; SB.view = v; history.replaceState(null, '', '#' + v); renderAll(); $('#scroll').scrollTop = 0; }

/* ─────────────── delegated events ─────────────── */
const ACTIONS = {};
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-view]'); if (tab) { setView(tab.dataset.view); return; }
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = ACTIONS[el.dataset.action]; if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (!el) return; const fn = ACTIONS[el.dataset.change]; if (fn) fn(el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (!el) return; const fn = ACTIONS[el.dataset.input]; if (fn) fn(el, e); });

/* ─────────────── derived helpers used by several views ─────────────── */
function realEntries() { return SB.entries; }
function countBy(list, key) { const m = new Map(); for (const e of list) for (const v of (e[key] || [])) { const k = slug(v); if (!k) continue; const cur = m.get(k) || { label: v, n: 0, ids: [] }; cur.n++; cur.ids.push(e.id); m.set(k, cur); } return m; }
function nodeEntries(kind, id) {
  const list = SB.entries; const s = slug(id);
  if (kind === 'theme') return list.filter((e) => (e.themes || []).some((t) => slug(t) === s));
  if (kind === 'person') return list.filter((e) => (e.people || []).some((t) => slug(t) === s));
  if (kind === 'project') return list.filter((e) => (e.projects || []).some((t) => slug(t) === s));
  if (kind === 'goal') return list.filter((e) => (e.goals || []).includes(id));
  if (kind === 'cluster') { const c = (window.Net && Net.summary ? Net.summary.clusters : []).find((x) => x.id === id); return c ? c.entries.map(entry).filter(Boolean).sort((a, b) => b.ts - a.ts) : []; }
  return [];
}
function goalLabel(id) { const g = SB.goals.find((x) => x.id === id); return g ? g.label : id; }
function mean(arr) { const a = arr.filter((x) => typeof x === 'number' && !Number.isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
const fmtMood = (m) => (m == null ? '–' : (m > 0 ? '+' : '') + (Math.round(m * 10) / 10));
const assetUrl = (id) => (window.LocalBridge ? '/assets/' + id : '/_blob/' + id);

/* ─────────────── older entries (the live subscription covers the newest 1,000) ─────────────── */
async function loadOlder() {
  if (!SB.caps.db || SB.oldestTs == null || SB._loadingOlder) return 0; SB._loadingOlder = true;
  try {
    const snap = await SB.caps.db.collection('entries').where('ts', '<', SB.oldestTs).orderBy('ts', 'desc').limit(1000).get();
    const docs = snap.docs.map((d) => d.data()).filter((x) => x && x.id); const have = new Set(SB.entries.map((e) => e.id).concat(SB.trash.map((e) => e.id)));
    const fresh = docs.filter((e) => !have.has(e.id)); SB.older = [...SB.older, ...fresh];
    for (const e of fresh) { if (e.deleted) SB.trash.push(e); else { SB.entries.push(e); SB.byId.set(e.id, e); } }
    SB.entries.sort((a, b) => b.ts - a.ts); SB.hasOlder = snap.docs.length >= 1000; if (docs.length) SB.oldestTs = Math.min(...docs.map((e) => e.ts || 0));
    scheduleRender(); Mirror.schedule(); return fresh.length;
  } catch (e) { toast(dbCopy(e), 'bad'); return 0; } finally { SB._loadingOlder = false; }
}
async function loadAllEntries() { let guard = 0; while (SB.hasOlder && guard++ < 50) { const n = await loadOlder(); if (!n) break; } }

/* ─────────────── browser mirror: a last-resort copy on this device (IndexedDB), never the source of truth ─────────────── */
const Mirror = {
  timer: null, db: null,
  open() { return new Promise((res) => { try { const r = indexedDB.open('second-brain-mirror', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } }); },
  schedule() { if (SB.demo || SB.readonly) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), 2000); },
  async save() {
    try { const db = this.db || (this.db = await this.open()); if (!db) return; const payload = { savedAt: new Date().toISOString(), entries: SB.entries.filter((e) => !e.example), trash: SB.trash, goals: SB.goals.filter((g) => !g.example), threads: SB.threads.filter((t) => !t.example), digests: [...SB.digests.values()], insights: [...SB.insights.values()], headsup: [...SB.headsup.values()], settings: SB.settings };
      await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(payload, 'mirror'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); SB.mirrorAt = payload.savedAt; } catch (e) { console.warn('mirror', e); }
  },
  async load() {
    try { const db = this.db || (this.db = await this.open()); if (!db) return false; const p = await new Promise((res) => { const tx = db.transaction('kv', 'readonly'); const r = tx.objectStore('kv').get('mirror'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); if (!p || !p.entries) return false;
      SB.entries = p.entries.sort((a, b) => b.ts - a.ts); SB.byId = new Map(SB.entries.map((e) => [e.id, e])); SB.trash = p.trash || []; SB.goals = p.goals || []; SB.threads = p.threads || []; SB.digests = new Map((p.digests || []).map((d) => [d.key, d])); SB.insights = new Map((p.insights || []).map((d) => [d.key, d])); SB.headsup = new Map((p.headsup || []).map((d) => [d.key, d])); SB.settings = Object.assign(clone(DEFAULT_SETTINGS), p.settings || {}); SB.mirrorAt = p.savedAt; return true; } catch { return false; }
  },
};
