/* ═══════════════════════════ shell, capture, journal, side panel ═══════════════════════════ */
function renderAll() {
  $$('.rail .tab').forEach((t) => { if (t.dataset.view === SB.view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + SB.view));
  renderTop(); renderBanner(); renderCaptureState();
  ({ journal: renderJournal, network: renderNetwork, patterns: renderPatterns, headsup: renderHeadsup, think: renderThink, review: renderReview, settings: renderSettings })[SB.view]();
  renderSide();
}
function renderTop() {
  const c = SB.caps; const st = streaks();
  const ai = !c.resolved ? '<span class="pill"><i class="dot"></i>connecting…</span>' : c.sample ? '<span class="pill on" title="Claude files entries and writes reviews on your account"><i class="dot"></i>Claude on</span>' : '<span class="pill off" title="Open in claude.ai to use Claude"><i class="dot"></i>Claude off</span>';
  const store = !c.resolved ? '' : c.db ? `<span class="pill on"><i class="dot"></i>${SB.entries.filter((e) => !e.example).length} entries kept</span>` : '<span class="pill warn"><i class="dot"></i>preview, nothing is saved</span>';
  const streak = st.current > 0 ? `<span class="pill" title="Consecutive days with an entry">🔥 <b class="mono">${st.current}</b>&nbsp;day streak</span>` : '';
  const due = backupDue(); const backup = due ? `<button class="pill warn" data-view="settings" title="Export a copy of your brain" style="cursor:pointer"><i class="dot"></i>${due}</button>` : '';
  $('#topRight').innerHTML = store + ai + streak + backup;
}
function renderBanner() {
  const b = $('#banner');
  if (SB.local && !SB.caps.sample) b.innerHTML = '<div class="banner">Claude is off: no API key yet. Entries are kept as plain cards until you add one under <b>Settings → Claude API</b>.</div>';
  else if (SB.readonly) b.innerHTML = `<div class="banner warn">Offline copy from ${SB.mirrorAt ? fmtShort(SB.mirrorAt.slice(0, 10)) : 'earlier'}: the store did not answer when the page opened. You can read and export; reload to try writing again.</div>`;
  else if (SB.demo && window.SB_DEMO && window.SB_DEMO.banner) b.innerHTML = `<div class="banner">${window.SB_DEMO.banner}</div>`;
  else if (SB.demo) b.innerHTML = `<div class="banner warn">${window.location.protocol === 'file:' ? 'Preview from a file: nothing is saved. Start the local service and open it at its address.' : 'Preview mode: this copy is not inside claude.ai, so nothing you write is kept and Claude cannot file entries. Open the published link to use your brain for real.'}</div>`;
  else if (SB.examples) b.innerHTML = '<div class="banner">The dashed cards are <b>examples</b>, not yours. They vanish the moment you drop in a real entry. <button class="btn ghost sm" data-action="hideExamples">Hide them now</button></div>';
  else b.innerHTML = '';
}

/* ─────────────── capture ─────────────── */
function renderCaptureState() {
  $$('#capTypes .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.ctype === SB.capture.type)));
  $$('#capMood button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.mood) === SB.capture.mood)));
  $$('#capEnergy button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.energy) === SB.capture.energy)));
  $('#capAttach').innerHTML = SB.capture.attachments.map((a) => `<img src="${esc(a.url)}" alt="attachment"> `).join('') + (SB.capture.replyTo ? `<span class="pill">↳ replying to <b>${esc(cut(entry(SB.capture.replyTo)?.title || '', 40))}</b> <button class="btn ghost sm" data-action="clearReply">×</button></span>` : '');
  $('#capSubmit').disabled = !SB.caps.resolved;
}
$('#capTypes').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; SB.capture.type = c.dataset.ctype; renderCaptureState(); });
$('#capMood').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const v = Number(b.dataset.mood); SB.capture.mood = SB.capture.mood === v ? null : v; renderCaptureState(); });
$('#capEnergy').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const v = Number(b.dataset.energy); SB.capture.energy = SB.capture.energy === v ? null : v; renderCaptureState(); });
$('#capText').addEventListener('input', (e) => { const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, window.innerHeight * 0.5) + 'px'; try { localStorage.setItem('sb.draft', t.value); } catch {} });
$('#capText').addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); captureSubmit(); } });
$('#capSubmit').addEventListener('click', captureSubmit);
$('#fab').addEventListener('click', () => { setView('journal'); $('#capText').focus(); });
$('#capImg').addEventListener('click', () => $('#fileImg').click());
$('#fileImg').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f || !SB.caps.assets) return;
  const st = $('#capStatus'); st.textContent = 'Uploading image…'; st.classList.add('busy');
  try { const r = await SB.caps.assets.upload(f, f.type ? undefined : { type: 'image/png' }); SB.capture.attachments.push({ id: r.id, url: r.url, type: r.contentType }); renderCaptureState(); st.textContent = 'Image attached.'; }
  catch (err) { st.textContent = ({ too_large: 'Image is over 20 MB.', unsupported_type: 'Only PNG, JPEG, WebP or GIF.', quota_or_state: 'Storage for images is full.' })[err && err.code] || 'Could not upload the image.'; }
  finally { st.classList.remove('busy'); }
});
ACTIONS.clearReply = () => { SB.capture.replyTo = null; renderCaptureState(); };

function newEntryFromCapture(text) {
  const d = new Date(); const t = SB.capture.type;
  return { id: uid('e'), createdAt: d.toISOString(), ts: d.getTime(), date: dateKey(d), time: timeKey(d), type: t || 'note', text, title: cut(text.split(/\n/)[0], 60), summary: '',
    mood: { ai: null, user: SB.capture.mood }, energy: { ai: null, user: SB.capture.energy }, themes: [], people: [], projects: [], goals: [], tasks: [], questions: [],
    links: SB.capture.replyTo ? [{ to: SB.capture.replyTo, reason: 'follow-up', status: 'accepted' }] : [], followup: null, attachments: SB.capture.attachments.map((a) => ({ id: a.id, type: a.type })),
    filing: AI.ready() ? 'pending' : 'manual', userType: !!t, edited: false, typeLocked: !!t };
}
async function captureSubmit() {
  const ta = $('#capText'); const text = ta.value.trim(); if (!text) { ta.focus(); return; }
  if (SB.demo) { toast('Preview mode: open the published page inside claude.ai to keep entries.', 'bad'); return; }
  const e = newEntryFromCapture(text);
  ta.value = ''; ta.style.height = 'auto'; try { localStorage.removeItem('sb.draft'); } catch {}
  SB.capture = { type: SB.capture.type, mood: null, energy: null, attachments: [], replyTo: null };
  if (SB.examples) { SB.examples = false; SB.entries = []; SB.byId = new Map(); SB.goals = SB.goals.filter((g) => !g.example); SB.threads = SB.threads.filter((t) => !t.example); }
  await saveEntry(e); setView('journal');
  if (AI.ready()) fileEntry(e.id); else toast('Saved. Claude is off, so fill in the fields by hand if you like.');
}
async function fileEntry(id) {
  if (!AI.ready() || SB.pendingFiling.has(id)) return; SB.pendingFiling.add(id);
  const st = $('#capStatus'); st.textContent = 'Claude is filing…'; st.classList.add('busy'); scheduleRender();
  try {
    const cur = entry(id); if (!cur) return;
    const out = await AI.file(cur);
    const e = clone(entry(id) || cur);
    e.title = out.title; if (!e.typeLocked) e.type = out.type; e.summary = out.summary;
    e.mood = { ai: out.mood, user: e.mood ? e.mood.user : null, evidence: out.moodEvidence || '' }; e.energy = { ai: out.energy, user: e.energy ? e.energy.user : null, evidence: out.energyEvidence || '' };
    e.themes = out.themes; e.themeEvidence = out.themeEvidence || {}; e.domains = out.domains || []; e.people = out.people; e.projects = out.projects; e.goals = [...new Set([...(e.goals || []), ...out.goals])];
    const oldT = e.tasks || [], oldQ = e.questions || []; const same = (a, b) => slug(a) === slug(b);
    e.tasks = out.tasks.map((t) => { const prev = oldT.find((x) => same(x.text, t)); return prev ? prev : { id: uid('t'), text: t, done: false }; }).concat(oldT.filter((x) => x.done && !out.tasks.some((t) => same(t, x.text))));
    e.questions = out.questions.map((q) => { const prev = oldQ.find((x) => same(x.text, q)); return prev ? prev : { id: uid('q'), text: q, resolved: false }; }).concat(oldQ.filter((x) => x.resolved && !out.questions.some((q) => same(q, x.text))));
    const have = new Set((e.links || []).map((l) => l.to)); e.links = [...(e.links || []), ...out.links.filter((l) => !have.has(l.to)).map((l) => ({ ...l, status: 'proposed' }))];
    e.followup = out.followup; e.filing = 'done'; e.filedAt = new Date().toISOString();
    for (const ng of out.new_goals) { const g = { id: uid('g'), label: ng.label, why: ng.why, status: 'active', createdAt: new Date().toISOString(), checkins: [], lastTouched: new Date().toISOString() }; await saveGoal(g); e.goals.push(g.id); }
    await saveEntry(e);
    st.textContent = `Filed as ${TYPE_LABEL[e.type].toLowerCase()}${e.themes.length ? ' · ' + e.themes.slice(0, 3).join(', ') : ''}${e.links.filter((l) => l.status === 'proposed').length ? ' · ' + e.links.filter((l) => l.status === 'proposed').length + ' link proposed' : ''}`;
  } catch (err) {
    const e = clone(entry(id)); if (e) { e.filing = 'failed'; e.filingError = err && err.code; await saveEntry(e); }
    st.textContent = sampleCopy(err); toast(sampleCopy(err), 'bad', 6000);
  } finally { st.classList.remove('busy'); SB.pendingFiling.delete(id); scheduleRender(); setTimeout(() => { if (st.textContent.startsWith('Filed')) st.textContent = ''; }, 8000); }
}

/* ─────────────── journal ─────────────── */
function streaks() {
  const days = new Set(SB.entries.map((e) => e.date)); let cur = 0; let d = new Date();
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  while (days.has(dateKey(d))) { cur++; d = addDays(d, -1); }
  return { current: cur, days: days.size };
}
function filteredEntries() {
  const f = SB.jf; const q = f.q.trim().toLowerCase();
  return SB.entries.filter((e) => (!f.type || e.type === f.type) && (!f.theme || (e.themes || []).some((t) => slug(t) === slug(f.theme))) && (!q || (e.text + ' ' + (e.title || '') + ' ' + (e.themes || []).join(' ') + ' ' + (e.people || []).join(' ')).toLowerCase().includes(q)));
}
function renderJournal() {
  const root = $('#view-journal'); const list = filteredEntries();
  const groups = new Map(); for (const e of list) { if (!groups.has(e.date)) groups.set(e.date, []); groups.get(e.date).push(e); }
  const themes = [...countBy(SB.entries, 'themes').values()].sort((a, b) => b.n - a.n).slice(0, 12);
  let html = '';
  const brainEmpty = SB.loaded.entries && !SB.demo && SB.entries.every((e) => e.example);
  if (brainEmpty) html += `<div class="welcome"><h3>${SB.examples ? 'An example brain, for scale.' : 'Start with today.'}</h3><p>Write the way you would in a paper journal: what happened, how it felt, what you are chewing on. Claude files it into a card with themes, mood, tasks and questions, which you can correct. Patterns appear after a week or two of entries.</p><div class="prompts">${['What is taking up space in my head right now?', 'Something I noticed today that I usually ignore', 'A decision I keep postponing', 'What went well this week, and why'].map((p) => `<button class="chip" data-action="prompt" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div><p class="small muted" style="margin-top:12px">${SB.examples ? 'These example cards are not stored. <button class="btn ghost sm" data-action="hideExamples">Hide examples</button>' : 'Curious what a filled brain looks like? <button class="btn ghost sm" data-action="showExamples">Show example cards</button> They are never saved.'}</p></div>`;
  html += ribbonHTML();
  html += `<div class="view-head"><h2>Journal</h2><div class="tools"><input class="search" id="jq" placeholder="Search entries" value="${esc(SB.jf.q)}" data-input="jsearch"><div class="seg">${['', ...TYPES].map((t) => `<button data-action="jtype" data-t="${t}" aria-pressed="${String(SB.jf.type === t)}">${t ? TYPE_LABEL[t] : 'All'}</button>`).join('')}</div></div></div>`;
  if (themes.length) html += `<div class="tags" style="margin:-4px 0 14px">${themes.map((t) => `<button class="tag" style="--c:var(--k-theme)" data-action="jtheme" data-t="${esc(t.label)}" ${slug(SB.jf.theme) === slug(t.label) ? 'aria-pressed="true" style="--c:var(--k-theme);border-color:var(--k-theme)"' : ''}><i></i>${esc(t.label)} <span class="mono muted">${t.n}</span></button>`).join('')}${SB.jf.theme ? `<button class="tag" data-action="jtheme" data-t="">clear theme ×</button>` : ''}</div>`;
  if (!list.length) html += `<div class="empty">${SB.loaded.entries || SB.demo ? (SB.entries.length ? 'Nothing matches that filter.' : 'Your brain is empty. The first entry goes in the box above.') : 'Loading your brain…'}</div>`;
  for (const [date, es] of groups) {
    const m = mean(es.map(effMood));
    html += `<div class="day" id="day-${date}"><h3>${fmtDay(date)}</h3><span class="meta">${fmtShort(date)} · ${es.length} ${es.length === 1 ? 'entry' : 'entries'}</span>${m != null ? `<span class="mood" style="background:${moodVar(Math.round(m))}" title="day mood ${fmtMood(m)}"></span>` : ''}</div><div class="cards">${es.map(cardHTML).join('')}</div>`;
  }
  if (SB.hasOlder) html += `<div style="text-align:center;margin:18px 0"><button class="btn" data-action="loadOlder">Load older entries</button><div class="small muted" style="margin-top:6px">The journal shows the newest 1,000 entries; everything older is stored and loads on request.</div></div>`;
  root.innerHTML = html;
  const jq = $('#jq'); if (jq && SB._jqFocus) { SB._jqFocus = false; jq.focus(); jq.setSelectionRange(jq.value.length, jq.value.length); }
}
ACTIONS.showExamples = () => { loadExamples(true); renderAll(); };
ACTIONS.hideExamples = () => { SB.examples = false; SB.entries = []; SB.byId = new Map(); SB.goals = SB.goals.filter((g) => !g.example); SB.threads = SB.threads.filter((t) => !t.example); Net.sig = ''; renderAll(); };
function backupDue() { const real = SB.entries.filter((e) => !e.example).length; if (SB.local) { const i = window.LocalBridge.info || {}; if (!i.lastBackupAt) return real >= 3 ? 'no backup yet' : ''; const d = daysBetween(new Date(i.lastBackupAt), new Date()); return d >= 2 ? `backup ${d} days old` : ''; } if (!SB.caps.db || real < 10) return ''; const last = SB.settings.lastExportAt; const days = last ? daysBetween(new Date(last), new Date()) : null; if (days == null) return 'no backup yet'; if (days >= 7) return `backup ${days} days old`; return ''; }
ACTIONS.loadOlder = async (el) => { el.disabled = true; el.textContent = 'Loading…'; const n = await loadOlder(); toast(n ? `${n} older entries loaded.` : 'No older entries.'); };
ACTIONS.prompt = (el) => { const ta = $('#capText'); ta.value = el.dataset.p + '\n\n'; ta.focus(); ta.dispatchEvent(new Event('input')); };
ACTIONS.jsearch = (el) => { SB.jf.q = el.value; SB._jqFocus = true; renderJournal(); };
ACTIONS.jtype = (el) => { SB.jf.type = el.dataset.t; renderJournal(); };
ACTIONS.jtheme = (el) => { SB.jf.theme = el.dataset.t; renderJournal(); };

function ribbonHTML() {
  const weeks = 18; const today = new Date(); const dow = (today.getDay() + 6) % 7; // Monday=0
  const start = addDays(today, -(weeks * 7 - 1) - dow + 6 - 6); // align grid columns to weeks
  const first = addDays(today, -((weeks - 1) * 7 + dow));
  const byDay = new Map(); for (const e of SB.entries) { const k = e.date; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); }
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(first, i); const k = dateKey(d); const es = byDay.get(k); const m = es ? mean(es.map(effMood)) : null;
    const mv = m == null ? 'none' : String(Math.round(m));
    cells += `<button class="cell ${k === dateKey(today) ? 'today' : ''}" data-m="${mv}" data-has="${es ? 1 : 0}" title="${fmtShort(k)}${es ? ` · ${es.length} ${es.length === 1 ? 'entry' : 'entries'}${m != null ? ' · mood ' + fmtMood(m) : ''}` : ''}" data-action="gotoDay" data-d="${k}" ${d > today ? 'disabled style="visibility:hidden"' : ''}></button>`;
  }
  const st = streaks(); const last30 = SB.entries.filter((e) => daysBetween(fromKey(e.date), today) < 30); const m30 = mean(last30.map(effMood));
  return `<div class="ribbon"><div class="stats"><span class="eyebrow">Last ${weeks} weeks</span><b>${st.days}</b><span class="small muted">days written</span><span class="small muted">30-day mood <b class="mono">${fmtMood(m30)}</b></span></div><div class="grid" aria-label="Mood by day">${cells}</div><div class="legend"><span>mood</span>${[-2, -1, 0, 1, 2].map((m) => `<i style="background:${moodVar(m)}"></i><span>${MOOD_LABEL[m]}</span>`).join('')}<i style="background:var(--line-strong)"></i><span>written, no mood</span></div></div>`;
}
ACTIONS.gotoDay = (el) => { SB.jf = { q: '', type: '', theme: '' }; renderJournal(); const d = $('#day-' + el.dataset.d); if (d) d.scrollIntoView({ block: 'start' }); else toast('No entry on ' + fmtShort(el.dataset.d)); };

function gaugeHTML(label, ai, user, min, max, cvar, evidence) {
  const v = user != null ? user : ai; if (v == null) return '';
  const segs = []; for (let i = min; i <= max; i++) segs.push(`<i class="${i <= v ? (user != null ? 'on' : 'ai on') : ''}" style="--c:${cvar}"></i>`);
  return `<span class="gauge" title="${label} ${v}${user != null ? ' (set by you)' : ' (Claude’s estimate)'}">${label} <span class="segs">${segs.join('')}</span><span class="mono">${label === 'mood' ? fmtMood(v) : v}</span>${user == null ? '<span class="badge soft">est.</span>' : ''}</span>`;
}
function cardHTML(e, compact = false) {
  const sel = SB.selected && SB.selected.kind === 'entry' && SB.selected.id === e.id;
  const long = (e.text || '').length > 520 && !SB.expanded.has(e.id);
  const tags = [...(e.themes || []).map((t) => ['theme', t]), ...(e.people || []).map((t) => ['person', t]), ...(e.projects || []).map((t) => ['project', t]), ...(e.goals || []).map((g) => ['goal', g])];
  const proposals = (e.links || []).filter((l) => l.status === 'proposed' && entry(l.to));
  const accepted = (e.links || []).filter((l) => l.status === 'accepted' && entry(l.to));
  const backlinks = SB.entries.filter((x) => (x.links || []).some((l) => l.to === e.id && l.status === 'accepted'));
  return `<article class="card ${sel ? 'selected' : ''} ${e.example ? 'example' : ''}" data-id="${e.id}">
    <div class="top"><span class="type" style="--c:${typeVar(e.type)}"><i></i>${TYPE_LABEL[e.type] || 'Note'}</span><span class="time">${e.time}</span>${e.example ? '<span class="badge">example</span>' : ''}${e.filing === 'pending' || SB.pendingFiling.has(e.id) ? '<span class="badge soft">filing…</span>' : ''}${e.filing === 'failed' ? `<span class="badge soft" style="color:var(--bad)">not filed</span> <button class="btn ghost sm" data-action="refile" data-id="${e.id}">Retry</button>` : ''}${e.edited ? '<span class="badge soft">edited</span>' : ''}<span class="grow" style="flex:1"></span><button class="btn ghost sm" data-action="select" data-kind="entry" data-id="${e.id}" title="Open details">Details</button></div>
    ${e.title ? `<div class="title">${esc(e.title)}</div>` : ''}
    <div class="text ${long ? 'clamp' : ''}">${esc(e.text)}</div>${long ? `<button class="more" data-action="expand" data-id="${e.id}">Read all</button>` : ''}
    ${(e.attachments || []).length ? `<div class="attach" style="padding:8px 0 0">${e.attachments.map((a) => `<img src="${esc(assetUrl(a.id))}" alt="" style="max-height:160px;border-radius:8px;border:1px solid var(--line)" loading="lazy">`).join(' ')}</div>` : ''}
    ${e.summary && !compact ? `<div class="summary">${esc(e.summary)}</div>` : ''}
    ${(e.domains || []).length ? `<div class="tags" style="margin-top:8px">${e.domains.map((d) => `<span class="tag" style="--c:var(--muted);border-style:dashed" title="area of life"><i></i>${esc(d)}</span>`).join('')}</div>` : ''}
    ${tags.length ? `<div class="tags">${tags.map(([k, t]) => `<button class="tag" style="--c:${kindVar(k)}" data-action="select" data-kind="${k}" data-id="${esc(t)}" ${k === 'theme' && e.themeEvidence && e.themeEvidence[t] ? `title="because: “${esc(e.themeEvidence[t])}”"` : ''}><i></i>${esc(k === 'goal' ? goalLabel(t) : t)}</button>`).join('')}</div>` : ''}
    <div class="gauges">${gaugeHTML('mood', e.mood && e.mood.ai, e.mood && e.mood.user, -2, 2, 'var(--m1)', e.mood && e.mood.evidence)}${gaugeHTML('energy', e.energy && e.energy.ai, e.energy && e.energy.user, 1, 5, 'var(--k-project)', e.energy && e.energy.evidence)}</div>
    ${(e.tasks || []).length ? `<ul class="list">${e.tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><label><input type="checkbox" ${t.done ? 'checked' : ''} data-change="task" data-id="${e.id}" data-t="${t.id}"><span>${esc(t.text)}</span></label></li>`).join('')}</ul>` : ''}
    ${(e.questions || []).length ? `<ul class="list">${e.questions.map((q) => `<li class="${q.resolved ? 'done' : ''}"><label><input type="checkbox" ${q.resolved ? 'checked' : ''} data-change="question" data-id="${e.id}" data-q="${q.id}" title="Mark resolved"><span class="q">? ${esc(q.text)}</span></label></li>`).join('')}</ul>` : ''}
    ${proposals.length ? `<div class="proposals">${proposals.map((l) => `<div class="proposal"><span class="badge soft">link?</span><span class="to">${esc(cut(entry(l.to).title || entry(l.to).text, 60))}</span><span class="why">${esc(l.reason)}</span><button class="btn sm" data-action="link" data-id="${e.id}" data-to="${l.to}" data-s="accepted">Accept</button><button class="btn ghost sm" data-action="link" data-id="${e.id}" data-to="${l.to}" data-s="rejected">No</button></div>`).join('')}</div>` : ''}
    ${accepted.length || backlinks.length ? `<div class="tags" style="margin-top:8px">${accepted.map((l) => `<button class="tag" style="--c:var(--accent)" data-action="select" data-kind="entry" data-id="${l.to}" title="${esc(l.reason)}">→ ${esc(cut(entry(l.to).title || entry(l.to).text, 40))}</button>`).join('')}${backlinks.map((b) => `<button class="tag" style="--c:var(--accent)" data-action="select" data-kind="entry" data-id="${b.id}">← ${esc(cut(b.title || b.text, 40))}</button>`).join('')}</div>` : ''}
    ${e.followup && !compact ? `<div class="followup">“${esc(e.followup)}”<button class="btn ghost sm" data-action="answer" data-id="${e.id}">Answer</button></div>` : ''}
    ${compact ? '' : `<div class="actions"><button class="btn ghost sm" data-action="edit" data-id="${e.id}">Edit</button>${AI.ready() && !e.example ? `<button class="btn ghost sm" data-action="refile" data-id="${e.id}" title="Ask Claude to file this card again; your own edits are kept">Re-file</button><button class="btn ghost sm" data-action="findLinks" data-id="${e.id}">Find links</button>` : ''}<button class="btn ghost sm" data-action="del" data-id="${e.id}">Delete</button></div>`}
  </article>`;
}
ACTIONS.expand = (el) => { SB.expanded.add(el.dataset.id); renderAll(); };
ACTIONS.select = (el) => { SB.selected = { kind: el.dataset.kind, id: el.dataset.id }; renderAll(); $('#side').classList.add('open'); };
ACTIONS.closeSide = () => { $('#side').classList.remove('open'); SB.selected = null; renderAll(); };
ACTIONS.task = async (el) => { const e = clone(entry(el.dataset.id)); if (!e) return; const t = (e.tasks || []).find((x) => x.id === el.dataset.t); if (!t) return; t.done = el.checked; t.doneAt = el.checked ? new Date().toISOString() : null; await saveEntry(e); };
ACTIONS.question = async (el) => { const e = clone(entry(el.dataset.id)); if (!e) return; const q = (e.questions || []).find((x) => x.id === el.dataset.q); if (!q) return; q.resolved = el.checked; q.resolvedAt = el.checked ? new Date().toISOString() : null; await saveEntry(e); };
ACTIONS.link = async (el) => { const e = clone(entry(el.dataset.id)); if (!e) return; const l = (e.links || []).find((x) => x.to === el.dataset.to); if (l) l.status = el.dataset.s; await saveEntry(e); };
ACTIONS.answer = (el) => { const e = entry(el.dataset.id); if (!e) return; SB.capture.replyTo = e.id; const ta = $('#capText'); ta.value = `↳ ${e.followup}\n\n`; setView('journal'); ta.focus(); ta.dispatchEvent(new Event('input')); renderCaptureState(); };
ACTIONS.refile = (el) => fileEntry(el.dataset.id);
ACTIONS.findLinks = async (el) => {
  const e = entry(el.dataset.id); if (!e || !AI.ready()) return; el.disabled = true; el.textContent = 'Looking…';
  try { const links = await AI.findLinks(e); const cur = clone(entry(e.id)); const have = new Set((cur.links || []).map((l) => l.to)); const fresh = links.filter((l) => !have.has(l.to)); cur.links = [...(cur.links || []), ...fresh.map((l) => ({ ...l, status: 'proposed' }))]; await saveEntry(cur); toast(fresh.length ? `${fresh.length} link${fresh.length > 1 ? 's' : ''} proposed.` : 'Nothing clearly related yet.'); }
  catch (err) { toast(sampleCopy(err), 'bad'); } finally { scheduleRender(); }
};
ACTIONS.del = async (el) => { if (el.dataset.armed !== '1') { el.dataset.armed = '1'; el.textContent = 'Really delete?'; el.classList.add('danger'); setTimeout(() => { el.dataset.armed = ''; el.textContent = 'Delete'; el.classList.remove('danger'); }, 4000); return; } const e = entry(el.dataset.id); if (e && e.example) { toast('Examples vanish on their own once you write.'); return; } await removeEntry(el.dataset.id); toast('Moved to the trash. Restore it from Settings if you change your mind.'); };

/* ─────────────── entry editor ─────────────── */
ACTIONS.edit = (el) => {
  const e = entry(el.dataset.id); if (!e) return; if (e.example) { toast('Examples cannot be edited; write your own entry.'); return; }
  const goalOpts = SB.goals.map((g) => `<button data-g="${g.id}" aria-pressed="${String((e.goals || []).includes(g.id))}">${esc(g.label)}</button>`).join('');
  openModal(`<h3>Edit entry</h3><div class="form" id="editForm" data-id="${e.id}">
    <label>Type<div class="seg" id="edType">${TYPES.map((t) => `<button data-t="${t}" aria-pressed="${String(e.type === t)}">${TYPE_LABEL[t]}</button>`).join('')}</div></label>
    <label>Title<input type="text" id="edTitle" value="${esc(e.title || '')}"></label>
    <label>Text<textarea id="edText">${esc(e.text)}</textarea></label>
    <div class="row"><span class="small muted">Mood (yours)</span><div class="seg" id="edMood">${[-2, -1, 0, 1, 2].map((m) => `<button data-m="${m}" aria-pressed="${String(e.mood && e.mood.user === m)}">${m > 0 ? '+' + m : m}</button>`).join('')}<button data-m="" aria-pressed="${String(!(e.mood && e.mood.user != null))}">let Claude estimate</button></div></div>
    <div class="row"><span class="small muted">Energy (yours)</span><div class="seg" id="edEnergy">${[1, 2, 3, 4, 5].map((m) => `<button data-m="${m}" aria-pressed="${String(e.energy && e.energy.user === m)}">${m}</button>`).join('')}<button data-m="" aria-pressed="${String(!(e.energy && e.energy.user != null))}">estimate</button></div></div>
    <label>Themes (comma separated)<input type="text" id="edThemes" value="${esc((e.themes || []).join(', '))}"></label>
    <label>People<input type="text" id="edPeople" value="${esc((e.people || []).join(', '))}"></label>
    <label>Projects<input type="text" id="edProjects" value="${esc((e.projects || []).join(', '))}"></label>
    ${SB.goals.length ? `<label>Goals touched<div class="seg" id="edGoals">${goalOpts}</div></label>` : ''}
    <label>Tasks (one per line)<textarea id="edTasks" style="min-height:70px">${esc((e.tasks || []).map((t) => (t.done ? '[x] ' : '') + t.text).join('\n'))}</textarea></label>
    <label>Open questions (one per line)<textarea id="edQs" style="min-height:60px">${esc((e.questions || []).map((q) => (q.resolved ? '[x] ' : '') + q.text).join('\n'))}</textarea></label>
  </div><div class="foot"><button class="btn ghost" data-action="closeModal">Cancel</button><button class="btn primary" data-action="saveEdit">Save</button></div>`);
  $('#modalBox').addEventListener('click', (ev) => { const b = ev.target.closest('.seg button'); if (!b) return; const seg = b.parentElement; $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', 'false')); if (seg.id === 'edGoals') { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); $$('button', seg).forEach((x) => { if (x !== b) x.setAttribute('aria-pressed', String(x.dataset.pressed === '1')); }); } else b.setAttribute('aria-pressed', 'true'); });
  $$('#edGoals button').forEach((b) => (b.dataset.pressed = b.getAttribute('aria-pressed') === 'true' ? '1' : '0'));
};
ACTIONS.closeModal = closeModal;
ACTIONS.saveEdit = async () => {
  const id = $('#editForm').dataset.id; const e = clone(entry(id)); if (!e) return closeModal();
  const pressed = (sel) => { const b = $$(sel + ' button').find((x) => x.getAttribute('aria-pressed') === 'true'); return b ? b.dataset : {}; };
  const lines = (sel) => $(sel).value.split('\n').map((s) => s.trim()).filter(Boolean);
  const csv = (sel) => $(sel).value.split(',').map((s) => s.trim()).filter(Boolean);
  const newType = pressed('#edType').t || e.type; if (newType !== e.type) e.typeLocked = true; e.type = newType;
  e.title = $('#edTitle').value.trim(); e.text = $('#edText').value;
  const m = pressed('#edMood').m; e.mood = { ai: e.mood ? e.mood.ai : null, user: m === '' || m == null ? null : Number(m) };
  const en = pressed('#edEnergy').m; e.energy = { ai: e.energy ? e.energy.ai : null, user: en === '' || en == null ? null : Number(en) };
  e.themes = csv('#edThemes').map((s) => s.toLowerCase()); e.people = csv('#edPeople'); e.projects = csv('#edProjects');
  if ($('#edGoals')) e.goals = $$('#edGoals button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.g);
  const oldT = e.tasks || []; e.tasks = lines('#edTasks').map((s) => { const done = /^\[x\]\s*/i.test(s); const text = s.replace(/^\[[ x]\]\s*/i, ''); const prev = oldT.find((t) => t.text === text); return { id: prev ? prev.id : uid('t'), text, done, doneAt: done ? (prev && prev.doneAt) || new Date().toISOString() : null }; });
  const oldQ = e.questions || []; e.questions = lines('#edQs').map((s) => { const resolved = /^\[x\]\s*/i.test(s); const text = s.replace(/^\[[ x]\]\s*/i, ''); const prev = oldQ.find((q) => q.text === text); return { id: prev ? prev.id : uid('q'), text, resolved }; });
  e.edited = true; if (e.filing === 'manual' || e.filing === 'failed') e.filing = 'done';
  closeModal(); await saveEntry(e); toast('Saved.', 'good');
};

/* ─────────────── side panel ─────────────── */
function renderSide() {
  const s = SB.selected; const root = $('#side');
  if (!s) { root.innerHTML = `<button class="btn ghost sm close" data-action="closeSide">Close</button><span class="eyebrow">Details</span><p class="muted small">Select an entry, a theme, a person, a project or a goal to see what it connects to.</p>${overviewHTML()}`; return; }
  if (s.kind === 'entry') {
    const e = entry(s.id); if (!e) { SB.selected = null; return renderSide(); }
    root.innerHTML = `<button class="btn ghost sm close" data-action="closeSide">Close</button><span class="eyebrow">${TYPE_LABEL[e.type] || 'Entry'} · ${fmtShort(e.date)} ${e.time}</span>${cardHTML(e, false)}`; return;
  }
  const es = nodeEntries(s.kind, s.id); const m = mean(es.map(effMood)); const cl = s.kind === 'cluster' && Net.summary ? Net.summary.clusters.find((c) => c.id === s.id) : null; const label = s.kind === 'goal' ? goalLabel(s.id) : s.kind === 'cluster' ? (cl ? cl.name : s.id) : s.id;
  const co = countBy(es, 'themes'); const coList = [...co.values()].filter((t) => slug(t.label) !== slug(s.id)).sort((a, b) => b.n - a.n).slice(0, 8);
  const first = es.length ? es[es.length - 1].date : null, last = es.length ? es[0].date : null;
  root.innerHTML = `<button class="btn ghost sm close" data-action="closeSide">Close</button><span class="eyebrow" style="color:${s.kind === 'cluster' ? 'var(--accent)' : kindVar(s.kind)}">${s.kind === 'cluster' ? 'Constellation' : KIND_LABEL[s.kind]}</span><h3>${esc(label)}</h3>${cl ? `<div class="tags" style="margin:4px 0 10px">${cl.members.slice(0, 12).map((mm) => `<button class="tag" style="--c:${kindVar(mm.kind)}" data-action="select" data-kind="${mm.kind}" data-id="${esc(mm.kind === 'goal' ? mm.gid : mm.label)}"><i></i>${esc(mm.label)} <span class="mono muted">${mm.n}</span></button>`).join('')}</div>` : ''}
    <dl class="kv"><dt>Entries</dt><dd class="mono">${es.length}</dd><dt>Mood with it</dt><dd class="mono">${fmtMood(m)}${m != null ? ` <span class="muted">(overall ${fmtMood(mean(SB.entries.map(effMood)))})</span>` : ''}</dd>${first ? `<dt>First</dt><dd>${fmtShort(first)}</dd><dt>Latest</dt><dd>${fmtShort(last)}</dd>` : ''}</dl>
    ${coList.length ? `<span class="eyebrow">Often together with</span><div class="tags" style="margin:6px 0 12px">${coList.map((t) => `<button class="tag" style="--c:var(--k-theme)" data-action="select" data-kind="theme" data-id="${esc(t.label)}"><i></i>${esc(t.label)} <span class="mono muted">${t.n}</span></button>`).join('')}</div>` : ''}
    <div class="row" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${s.kind === 'cluster' ? '' : `<button class="btn sm" data-action="netFocus" data-kind="${s.kind}" data-id="${esc(s.id)}">Show in network</button>`}${s.kind === 'theme' ? `<button class="btn sm" data-action="jthemeSide" data-t="${esc(s.id)}">Filter journal</button>` : ''}</div>
    <div class="mini">${es.slice(0, 30).map((e) => `<div class="mini-card" data-action="select" data-kind="entry" data-id="${e.id}"><b>${esc(e.title || cut(e.text, 60))}</b><span>${fmtShort(e.date)} · ${TYPE_LABEL[e.type]}${effMood(e) != null ? ' · mood ' + fmtMood(effMood(e)) : ''}</span></div>`).join('')}</div>`;
}
ACTIONS.jthemeSide = (el) => { SB.jf.theme = el.dataset.t; setView('journal'); };
ACTIONS.netFocus = (el) => { SB.netFocus = { kind: el.dataset.kind, id: el.dataset.id }; setView('network'); };
function overviewHTML() {
  const t = [...countBy(SB.entries, 'themes').values()].sort((a, b) => b.n - a.n).slice(0, 10);
  const p = [...countBy(SB.entries, 'people').values()].sort((a, b) => b.n - a.n).slice(0, 6);
  const open = SB.entries.flatMap((e) => (e.tasks || []).filter((x) => !x.done).map((x) => ({ e, x }))).slice(0, 8);
  return `${t.length ? `<span class="eyebrow">Themes</span><div class="tags" style="margin:6px 0 14px">${t.map((x) => `<button class="tag" style="--c:var(--k-theme)" data-action="select" data-kind="theme" data-id="${esc(x.label)}"><i></i>${esc(x.label)} <span class="mono muted">${x.n}</span></button>`).join('')}</div>` : ''}
  ${p.length ? `<span class="eyebrow">People</span><div class="tags" style="margin:6px 0 14px">${p.map((x) => `<button class="tag" style="--c:var(--k-person)" data-action="select" data-kind="person" data-id="${esc(x.label)}"><i></i>${esc(x.label)} <span class="mono muted">${x.n}</span></button>`).join('')}</div>` : ''}
  ${open.length ? `<span class="eyebrow">Open tasks</span><ul class="list" style="margin-top:6px">${open.map(({ e, x }) => `<li><label><input type="checkbox" data-change="task" data-id="${e.id}" data-t="${x.id}"><span>${esc(x.text)}</span></label></li>`).join('')}</ul>` : ''}`;
}
