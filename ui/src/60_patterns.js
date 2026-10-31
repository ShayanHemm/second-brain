/* ═══════════════════════════ patterns: deterministic statistics + Claude's reading ═══════════════════════════ */
function computeStats() {
  const list = SB.entries; const today = new Date(); const tk = dateKey(today);
  const overall = mean(list.map(effMood)); const ratedN = list.filter((e) => effMood(e) != null).length;
  const dayAgg = new Map(); for (const e of list) { const m = effMood(e); const a = dayAgg.get(e.date) || { sum: 0, n: 0, c: 0 }; a.c++; if (m != null) { a.sum += m; a.n++; } dayAgg.set(e.date, a); }
  const dayMean = (k) => { const a = dayAgg.get(k); return a && a.n ? a.sum / a.n : null; };
  const eAgg = new Map(); for (const e of list) { const v = effEnergy(e); if (v == null) continue; const a = eAgg.get(e.date) || { sum: 0, n: 0 }; a.sum += v; a.n++; eAgg.set(e.date, a); }
  const eDayMean = (k) => { const a = eAgg.get(k); return a && a.n ? a.sum / a.n : null; };
  const eseries = []; for (let i = 89; i >= 0; i--) { const d = addDays(today, -i); const k = dateKey(d); eseries.push({ date: k, m: eDayMean(k), n: (eAgg.get(k) || { n: 0 }).n }); }
  for (let i = 0; i < eseries.length; i++) { let sm = 0, n = 0; for (let j = Math.max(0, i - 6); j <= i; j++) { const a = eAgg.get(eseries[j].date); if (a && a.n) { sm += a.sum; n += a.n; } } eseries[i].roll = n ? sm / n : null; }
  // 90-day series + rolling 7-day mean (weighted by rated entries)
  const series = []; for (let i = 89; i >= 0; i--) { const d = addDays(today, -i); const k = dateKey(d); series.push({ date: k, m: dayMean(k), n: (dayAgg.get(k) || { c: 0 }).c }); }
  for (let i = 0; i < series.length; i++) { let s = 0, n = 0; for (let j = Math.max(0, i - 6); j <= i; j++) { const a = dayAgg.get(series[j].date); if (a && a.n) { s += a.sum; n += a.n; } } series[i].roll = n ? s / n : null; }
  // weekday profile (Mon..Sun)
  const wd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0, c: 0 })); for (const e of list) { const i = (fromKey(e.date).getDay() + 6) % 7; const m = effMood(e); wd[i].c++; if (m != null) { wd[i].sum += m; wd[i].n++; } }
  const weekday = wd.map((a, i) => ({ day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], mean: a.n ? a.sum / a.n : null, n: a.n, c: a.c }));
  // entries per week (12 weeks)
  const perWeek = []; for (let i = 11; i >= 0; i--) { const d = addDays(today, -7 * i); const k = weekKey(d); perWeek.push({ week: k, n: list.filter((e) => weekKey(fromKey(e.date)) === k).length }); }
  // theme trends: last 30 vs previous 30 days
  const inWin = (e, a, b) => { const d = daysBetween(fromKey(e.date), today); return d >= a && d < b; };
  const cur = list.filter((e) => inWin(e, 0, 30)), prev = list.filter((e) => inWin(e, 30, 60));
  const tc = countBy(cur, 'themes'), tp = countBy(prev, 'themes'), tall = countBy(list, 'themes');
  const themeTrends = [...tall.values()].filter((t) => t.n >= 2).map((t) => { const k = slug(t.label); const a = (tc.get(k) || { n: 0 }).n, b = (tp.get(k) || { n: 0 }).n; const sa = cur.length ? a / cur.length : 0, sb = prev.length ? b / prev.length : 0; return { label: t.label, total: t.n, cur: a, prev: b, share: sa, prevShare: sb, delta: sa - sb }; }).sort((x, y) => y.cur - x.cur || y.total - x.total).slice(0, 12);
  // theme × mood
  const themeMood = [...tall.values()].map((t) => { const es = t.ids.map(entry).filter(Boolean); const ms = es.map(effMood).filter((m) => m != null); return { label: t.label, n: ms.length, mean: mean(ms), diff: overall != null && ms.length ? mean(ms) - overall : null }; }).filter((t) => t.n >= 3 && t.diff != null).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);
  // co-occurrence
  const pairs = new Map(); for (const e of list) { const ts = [...new Set((e.themes || []).map(slug))].sort(); for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const k = ts[i] + ' + ' + ts[j]; pairs.set(k, (pairs.get(k) || 0) + 1); } }
  const cooccur = [...pairs.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => ({ pair: k, n }));
  // open loops
  const loops = [];
  for (const e of list) { for (const q of e.questions || []) if (!q.resolved) loops.push({ kind: 'question', text: q.text, since: e.date, days: daysBetween(fromKey(e.date), today), id: e.id }); for (const t of e.tasks || []) if (!t.done) loops.push({ kind: 'task', text: t.text, since: e.date, days: daysBetween(fromKey(e.date), today), id: e.id }); }
  for (const g of SB.goals) if (g.status === 'active') { const last = g.checkins && g.checkins.length ? g.checkins[g.checkins.length - 1].at : g.createdAt; const d = daysBetween(new Date(last), today); if (d >= 14) loops.push({ kind: 'goal', text: `No check-in on “${g.label}”`, since: dateKey(new Date(last)), days: d, gid: g.id }); }
  for (const t of SB.threads) if (t.status === 'open') { const d = daysBetween(new Date(t.updatedAt || t.createdAt), today); if (d >= 7) loops.push({ kind: 'thread', text: `Unfinished thinking: ${t.title || t.problem}`, since: dateKey(new Date(t.createdAt)), days: d, tid: t.id }); }
  loops.sort((a, b) => b.days - a.days);
  // what precedes low days
  const lowDays = [...dayAgg.entries()].filter(([, a]) => a.n && a.sum / a.n <= -1).map(([k]) => k); const pre = new Map();
  for (const k of lowDays) { const prevK = dateKey(addDays(fromKey(k), -1)); for (const e of list.filter((x) => x.date === prevK)) for (const t of e.themes || []) pre.set(slug(t), (pre.get(slug(t)) || 0) + 1); }
  const precedesLow = { lowDays: lowDays.length, themes: [...pre.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => ({ theme: t, n })) };
  // time of day
  const tod = { night: { sum: 0, n: 0, c: 0 }, morning: { sum: 0, n: 0, c: 0 }, afternoon: { sum: 0, n: 0, c: 0 }, evening: { sum: 0, n: 0, c: 0 } };
  for (const e of list) { const h = Number((e.time || '12:00').split(':')[0]); const b = h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; tod[b].c++; const m = effMood(e); if (m != null) { tod[b].sum += m; tod[b].n++; } }
  const timeOfDay = Object.entries(tod).map(([k, a]) => ({ bucket: k, c: a.c, n: a.n, mean: a.n ? a.sum / a.n : null }));
  const etod = { night: { sum: 0, n: 0 }, morning: { sum: 0, n: 0 }, afternoon: { sum: 0, n: 0 }, evening: { sum: 0, n: 0 } };
  for (const e of list) { const v = effEnergy(e); if (v == null) continue; const h = Number((e.time || '12:00').split(':')[0]); const b = h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; etod[b].sum += v; etod[b].n++; }
  const energyTod = Object.entries(etod).map(([k, a]) => ({ bucket: k, n: a.n, mean: a.n ? a.sum / a.n : null }));
  // mood against energy: agitation (low mood, high energy), depletion (low mood, low energy), enthusiasm, calm
  const both = list.filter((e) => effMood(e) != null && effEnergy(e) != null).map((e) => ({ id: e.id, title: e.title, date: e.date, mood: effMood(e), energy: effEnergy(e) }));
  const quad = { agitation: 0, depletion: 0, enthusiasm: 0, calm: 0, middle: 0, total: both.length };
  for (const b of both) { if (b.mood < 0 && b.energy >= 4) quad.agitation++; else if (b.mood < 0 && b.energy <= 2) quad.depletion++; else if (b.mood > 0 && b.energy >= 4) quad.enthusiasm++; else if (b.mood > 0 && b.energy <= 2) quad.calm++; else quad.middle++; }
  const energyOverall = mean(list.map(effEnergy)); const energy30 = mean(cur.map(effEnergy)), energy30prev = mean(prev.map(effEnergy));
  const typeMix = TYPES.map((t) => ({ type: t, n: list.filter((e) => e.type === t).length })).filter((x) => x.n);
  // streaks
  const days = [...new Set(list.map((e) => e.date))].sort(); let longest = 0, run = 0; for (let i = 0; i < days.length; i++) { run = i && daysBetween(fromKey(days[i - 1]), fromKey(days[i])) === 1 ? run + 1 : 1; longest = Math.max(longest, run); }
  const st = streaks();
  const mood30 = mean(cur.map(effMood)), mood30prev = mean(prev.map(effMood));
  return { total: list.length, ratedN, overall, days: days.length, streak: st.current, longest, mood30, mood30prev, entries30: cur.length, entries30prev: prev.length, series, weekday, perWeek, themeTrends, themeMood, cooccur, loops, precedesLow, timeOfDay, typeMix, today: tk, eseries, energyTod, both, quad, energyOverall, energy30, energy30prev, energyN: both.length };
}
const conf = (n) => (n < 8 ? 'suggestive' : n < 20 ? 'moderate' : 'strong');
const confTag = (n) => `<span class="conf" title="${n} observations">${conf(n)} · n=${n}</span>`;
function statements(s) {
  const out = []; const pm = (x) => fmtMood(x);
  if (s.ratedN >= 3 && s.mood30 != null && s.mood30prev != null) out.push({ t: `Your mood over the last 30 days averages <b>${pm(s.mood30)}</b> (${s.entries30} entries), against <b>${pm(s.mood30prev)}</b> in the 30 days before.`, n: s.entries30 + s.entries30prev });
  const wds = s.weekday.filter((w) => w.n >= 3); if (wds.length >= 2 && s.overall != null) { const lo = wds.reduce((a, b) => (a.mean < b.mean ? a : b)), hi = wds.reduce((a, b) => (a.mean > b.mean ? a : b)); if (hi.mean - lo.mean >= 0.6) out.push({ t: `<b>${lo.day}</b> is your lowest weekday (mean ${pm(lo.mean)} over ${lo.n} rated entries); <b>${hi.day}</b> is the highest (${pm(hi.mean)} over ${hi.n}).`, n: lo.n + hi.n }); }
  const riser = s.themeTrends.filter((t) => t.cur >= 3 && t.delta > 0.08).sort((a, b) => b.delta - a.delta)[0]; if (riser) out.push({ t: `<b>${esc(riser.label)}</b> appears in ${Math.round(riser.share * 100)}% of entries this month (${riser.cur} of ${s.entries30}), up from ${Math.round(riser.prevShare * 100)}% the month before.`, n: riser.cur + riser.prev });
  const fader = s.themeTrends.filter((t) => t.prev >= 3 && t.delta < -0.08).sort((a, b) => a.delta - b.delta)[0]; if (fader) out.push({ t: `<b>${esc(fader.label)}</b> is fading: ${Math.round(fader.prevShare * 100)}% of entries last month, ${Math.round(fader.share * 100)}% this month.`, n: fader.cur + fader.prev });
  for (const t of s.themeMood.filter((x) => Math.abs(x.diff) >= 0.6).slice(0, 2)) out.push({ t: `Entries that mention <b>${esc(t.label)}</b> average <b>${pm(t.mean)}</b> mood, ${t.diff < 0 ? 'below' : 'above'} your overall ${pm(s.overall)}. Association, not cause.`, n: t.n });
  if (s.precedesLow.lowDays >= 2 && s.precedesLow.themes.length) out.push({ t: `The day before a low day (${s.precedesLow.lowDays} low days so far), the most common themes were ${s.precedesLow.themes.slice(0, 3).map((x) => `<b>${esc(x.theme)}</b> (${x.n})`).join(', ')}.`, n: s.precedesLow.lowDays });
  const tb = s.timeOfDay.filter((x) => x.n >= 3); if (tb.length >= 2) { const lo = tb.reduce((a, b) => (a.mean < b.mean ? a : b)), hi = tb.reduce((a, b) => (a.mean > b.mean ? a : b)); const most = s.timeOfDay.reduce((a, b) => (a.c > b.c ? a : b)); if (hi.mean - lo.mean >= 0.6) out.push({ t: `You write most in the <b>${most.bucket}</b> (${most.c} of ${s.total}); ${lo.bucket} entries run lower (${pm(lo.mean)}, n=${lo.n}) than ${hi.bucket} ones (${pm(hi.mean)}, n=${hi.n}).`, n: lo.n + hi.n }); }
  const oldQ = s.loops.filter((l) => l.kind === 'question' && l.days >= 14).length; if (oldQ) out.push({ t: `<b>${oldQ}</b> question${oldQ > 1 ? 's have' : ' has'} stayed open for more than two weeks.`, n: oldQ });
  const oldT = s.loops.filter((l) => l.kind === 'task' && l.days >= 7).length; if (oldT) out.push({ t: `<b>${oldT}</b> task${oldT > 1 ? 's are' : ' is'} more than a week old and still undone.`, n: oldT });
  if (s.energy30 != null && s.energy30prev != null && s.energyN >= 6 && Math.abs(s.energy30 - s.energy30prev) >= 0.6) out.push({ t: `Your energy over the last 30 days averages <b>${s.energy30.toFixed(1)}</b> out of 5, against <b>${s.energy30prev.toFixed(1)}</b> the month before.`, n: s.energyN });
  if (s.quad.total >= 6) { const low = s.quad.agitation + s.quad.depletion; if (low >= 3) out.push({ t: `Of your <b>${low}</b> low-mood entries with an energy reading, <b>${s.quad.agitation}</b> look like agitation (energy 4 or 5) and <b>${s.quad.depletion}</b> like depletion (energy 1 or 2). ${s.quad.agitation > s.quad.depletion ? 'Your bad days tend to be wired, not flat.' : s.quad.depletion > s.quad.agitation ? 'Your bad days tend to be flat, not wired.' : 'They split evenly.'}`, n: low }); }
  const et = s.energyTod.filter((x) => x.n >= 3); if (et.length >= 2) { const lo = et.reduce((a, b) => (a.mean < b.mean ? a : b)), hi = et.reduce((a, b) => (a.mean > b.mean ? a : b)); if (hi.mean - lo.mean >= 0.8) out.push({ t: `Energy peaks in the <b>${hi.bucket}</b> (${hi.mean.toFixed(1)}, n=${hi.n}) and is lowest in the <b>${lo.bucket}</b> (${lo.mean.toFixed(1)}, n=${lo.n}).`, n: lo.n + hi.n }); }
  if (s.cooccur.length) out.push({ t: `Themes that travel together: ${s.cooccur.slice(0, 3).map((c) => `<b>${esc(c.pair)}</b> (${c.n})`).join(', ')}.`, n: s.cooccur[0].n });
  if (s.streak >= 3) out.push({ t: `Current writing streak: <b>${s.streak} days</b>; longest so far: ${s.longest}.`, n: s.streak });
  return out;
}
function moodChartSVG(series) {
  const W = 640, H = 170, L = 28, R = 8, T = 12, B = 26; const x = d3.scaleLinear().domain([0, series.length - 1]).range([L, W - R]); const y = d3.scaleLinear().domain([-2, 2]).range([H - B, T]);
  const line = d3.line().defined((d) => d.roll != null).x((d, i) => x(i)).y((d) => y(d.roll)).curve(d3.curveMonotoneX);
  const area = d3.area().defined((d) => d.roll != null).x((d, i) => x(i)).y0(y(0)).y1((d) => y(d.roll)).curve(d3.curveMonotoneX);
  const months = []; series.forEach((d, i) => { if (d.date.endsWith('-01') || i === 0) months.push({ i, label: MONTHS[fromKey(d.date).getMonth()].slice(0, 3) }); });
  const dots = series.map((d, i) => (d.m == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(d.m).toFixed(1)}" r="${2.4 + Math.min(2, d.n * 0.4)}" fill="${moodVar(Math.round(d.m))}"><title>${fmtShort(d.date)} · mood ${fmtMood(d.m)} · ${d.n} ${d.n === 1 ? 'entry' : 'entries'}</title></circle>`)).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mood over the last 90 days">${[-2, -1, 0, 1, 2].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v === 0 ? 1.2 : 0.6}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-mono)">${v > 0 ? '+' + v : v}</text>`).join('')}
    ${months.map((m) => `<text x="${x(m.i)}" y="${H - 8}" font-size="10" fill="var(--muted)">${m.label}</text>`).join('')}
    <path d="${area(series) || ''}" fill="var(--accent)" opacity="0.12"/><path d="${line(series) || ''}" fill="none" stroke="var(--accent)" stroke-width="2"/>${dots}</svg>`;
}
function energyChartSVG(series) {
  const W = 640, H = 150, L = 28, R = 8, T = 12, B = 26; const x = d3.scaleLinear().domain([0, series.length - 1]).range([L, W - R]); const y = d3.scaleLinear().domain([1, 5]).range([H - B, T]);
  const line = d3.line().defined((d) => d.roll != null).x((d, i) => x(i)).y((d) => y(d.roll)).curve(d3.curveMonotoneX);
  const area = d3.area().defined((d) => d.roll != null).x((d, i) => x(i)).y0(y(1)).y1((d) => y(d.roll)).curve(d3.curveMonotoneX);
  const months = []; series.forEach((d, i) => { if (d.date.endsWith('-01') || i === 0) months.push({ i, label: MONTHS[fromKey(d.date).getMonth()].slice(0, 3) }); });
  const dots = series.map((d, i) => (d.m == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(d.m).toFixed(1)}" r="${2.4 + Math.min(2, d.n * 0.4)}" fill="var(--k-project)"><title>${fmtShort(d.date)} · energy ${d.m.toFixed(1)} · ${d.n} ${d.n === 1 ? 'reading' : 'readings'}</title></circle>`)).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Energy over the last 90 days">${[1, 2, 3, 4, 5].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v === 3 ? 1.2 : 0.6}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-mono)">${v}</text>`).join('')}
    ${months.map((m) => `<text x="${x(m.i)}" y="${H - 8}" font-size="10" fill="var(--muted)">${m.label}</text>`).join('')}
    <path d="${area(series) || ''}" fill="var(--k-project)" opacity="0.10"/><path d="${line(series) || ''}" fill="none" stroke="var(--k-project)" stroke-width="2"/>${dots}</svg>`;
}
function energyTodSVG(rows) {
  const W = 320, H = 120, L = 10, T = 12, B = 24; const bw = (W - L * 2) / rows.length; const y = d3.scaleLinear().domain([1, 5]).range([H - B, T]);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean energy by time of day"><line x1="${L}" x2="${W - L}" y1="${y(1)}" y2="${y(1)}" stroke="var(--line-strong)"/><line x1="${L}" x2="${W - L}" y1="${y(3)}" y2="${y(3)}" stroke="var(--line)" stroke-dasharray="3 3"/>${rows.map((w, i) => { const cx = L + bw * i + bw / 2; const lab = `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${w.bucket}</text>`; if (w.mean == null) return lab; const top = y(w.mean); return `<rect x="${cx - bw * 0.28}" y="${top}" width="${bw * 0.56}" height="${Math.max(2, y(1) - top)}" rx="3" fill="var(--k-project)" opacity="0.85"><title>${w.bucket}: mean energy ${w.mean.toFixed(1)} over ${w.n} readings</title></rect><text x="${cx}" y="${top - 4}" text-anchor="middle" font-size="9.5" fill="var(--ink-2)" font-family="var(--font-mono)">${w.mean.toFixed(1)} · n${w.n}</text>${lab}`; }).join('')}</svg>`;
}
function quadrantSVG(both, quad) {
  const W = 340, H = 250, L = 34, R = 12, T = 18, B = 30; const x = d3.scaleLinear().domain([0.5, 5.5]).range([L, W - R]); const y = d3.scaleLinear().domain([-2.6, 2.6]).range([H - B, T]);
  const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 1000; };
  const pts = both.map((b) => { const jx = (hash(b.id) - 0.5) * 0.5, jy = (hash(b.id + 'y') - 0.5) * 0.5; return `<circle cx="${x(b.energy + jx).toFixed(1)}" cy="${y(b.mood + jy).toFixed(1)}" r="4.5" fill="${moodVar(b.mood)}" stroke="var(--surface)" stroke-width="1" opacity="0.9"><title>${esc(b.title || '')} · ${fmtShort(b.date)} · mood ${fmtMood(b.mood)} · energy ${b.energy}</title></circle>`; }).join('');
  const lab = (tx, ty, text, n, anchor) => `<text x="${tx}" y="${ty}" font-size="10" fill="var(--muted)" text-anchor="${anchor}" letter-spacing="0.08em">${text}</text><text x="${tx}" y="${ty + 13}" font-size="11" fill="var(--ink-2)" text-anchor="${anchor}" font-family="var(--font-mono)">${n}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mood against energy">
    <line x1="${x(3)}" x2="${x(3)}" y1="${y(2.6)}" y2="${y(-2.6)}" stroke="var(--line-strong)"/><line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)"/>
    ${lab(L + 4, T + 8, 'CALM', quad.calm, 'start')}${lab(W - R - 4, T + 8, 'ENTHUSIASM', quad.enthusiasm, 'end')}${lab(L + 4, H - B - 16, 'DEPLETION', quad.depletion, 'start')}${lab(W - R - 4, H - B - 16, 'AGITATION', quad.agitation, 'end')}
    ${[1, 2, 3, 4, 5].map((v) => `<text x="${x(v)}" y="${H - 9}" text-anchor="middle" font-size="10" fill="var(--muted)" font-family="var(--font-mono)">${v}</text>`).join('')}<text x="${W / 2}" y="${H - 1}" text-anchor="middle" font-size="9.5" fill="var(--muted)">energy →</text>
    ${[-2, 0, 2].map((v) => `<text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="var(--font-mono)">${v > 0 ? '+' + v : v}</text>`).join('')}
    ${pts}</svg>`;
}
function weekdaySVG(weekday) {
  const W = 320, H = 130, L = 10, T = 10, B = 24; const bw = (W - L * 2) / 7; const y = d3.scaleLinear().domain([-2, 2]).range([H - B, T]);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mean mood by weekday"><line x1="${L}" x2="${W - L}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)"/>${weekday.map((w, i) => { const cx = L + bw * i + bw / 2; if (w.mean == null) return `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${w.day}</text>`; const h = Math.abs(y(w.mean) - y(0)); const top = w.mean >= 0 ? y(w.mean) : y(0); return `<rect x="${cx - bw * 0.3}" y="${top}" width="${bw * 0.6}" height="${Math.max(2, h)}" rx="3" fill="${moodVar(Math.round(w.mean))}"><title>${w.day}: mean ${fmtMood(w.mean)} over ${w.n} rated entries</title></rect><text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${w.day}</text><text x="${cx}" y="${top - 4 < 12 ? top + 12 : top - 4}" text-anchor="middle" font-size="9.5" fill="var(--ink-2)" font-family="var(--font-mono)">${w.n}</text>`; }).join('')}</svg>`;
}
function perWeekSVG(pw) {
  const W = 320, H = 90, L = 6, T = 14, B = 20; const bw = (W - L * 2) / pw.length; const max = Math.max(1, ...pw.map((p) => p.n)); const y = d3.scaleLinear().domain([0, max]).range([H - B, T]);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entries per week"><line x1="${L}" x2="${W - L}" y1="${H - B}" y2="${H - B}" stroke="var(--line-strong)"/>${pw.map((p, i) => { const x = L + bw * i + bw * 0.2; return `<rect x="${x}" y="${y(p.n)}" width="${bw * 0.6}" height="${H - B - y(p.n)}" rx="2" fill="var(--k-project)" opacity="${i === pw.length - 1 ? 1 : 0.7}"><title>${p.week}: ${p.n} entries</title></rect>${p.n ? `<text x="${x + bw * 0.3}" y="${y(p.n) - 3}" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="var(--font-mono)">${p.n}</text>` : ''}`; }).join('')}<text x="${L}" y="${H - 6}" font-size="9.5" fill="var(--muted)">12 weeks ago</text><text x="${W - L}" y="${H - 6}" font-size="9.5" fill="var(--muted)" text-anchor="end">this week</text></svg>`;
}
function statsForAI(s) {
  return { total: s.total, ratedEntries: s.ratedN, overallMeanMood: s.overall, daysWritten: s.days, currentStreak: s.streak, longestStreak: s.longest, mood30: s.mood30, mood30prev: s.mood30prev, entries30: s.entries30, entries30prev: s.entries30prev,
    weekday: s.weekday.map((w) => ({ day: w.day, meanMood: w.mean, ratedN: w.n })), themeTrends: s.themeTrends.slice(0, 8).map((t) => ({ theme: t.label, thisMonth: t.cur, lastMonth: t.prev, shareNow: +t.share.toFixed(2), shareBefore: +t.prevShare.toFixed(2) })),
    themeMood: s.themeMood.slice(0, 8).map((t) => ({ theme: t.label, meanMood: +t.mean.toFixed(2), diffFromOverall: +t.diff.toFixed(2), n: t.n })), cooccur: s.cooccur, energy: { overall: s.energyOverall, last30: s.energy30, previous30: s.energy30prev, readings: s.energyN, byTimeOfDay: s.energyTod, moodEnergyQuadrants: s.quad }, openLoops: s.loops.slice(0, 10).map((l) => ({ kind: l.kind, text: cut(l.text, 80), days: l.days })), precedesLow: s.precedesLow, timeOfDay: s.timeOfDay, typeMix: s.typeMix };
}
function renderPatterns() {
  const root = $('#view-patterns'); const s = computeStats(); const sts = statements(s); const wk = 'w-' + weekKey(new Date()); const ins = SB.insights.get(wk);
  root.innerHTML = `<div class="view-head"><h2>Patterns</h2><span class="muted small">Computed from your cards: mood you set wins over Claude’s estimate. Counts are shown everywhere because one journal is a small sample.</span></div>
  <div class="tiles"><div class="tile"><div class="v">${s.total}</div><div class="l">entries</div></div><div class="tile"><div class="v">${s.days}</div><div class="l">days written</div></div><div class="tile"><div class="v">${s.streak}</div><div class="l">day streak (longest ${s.longest})</div></div><div class="tile"><div class="v">${fmtMood(s.mood30)}</div><div class="l">mean mood, 30 days</div></div><div class="tile"><div class="v">${s.loops.length}</div><div class="l">open loops</div></div></div>
  <div class="panels">
    <div class="panel wide"><h3>Mood, last 90 days</h3><div class="sub">Dots are day means; the line is a 7-day rolling mean. Hover a dot.</div>${s.ratedN ? moodChartSVG(s.series) : '<div class="empty">No rated entries yet.</div>'}</div>
    <div class="panel wide"><h3>Energy, last 90 days</h3><div class="sub">1 drained · 3 ordinary · 5 wired. Dots are day means; the line is a 7-day rolling mean. Readings you set win over Claude\u2019s estimates.</div>${s.energyN ? energyChartSVG(s.eseries) : '<div class="empty">No energy readings yet. Set the Energy dial when you write, or let Claude estimate it from the text.</div>'}</div>
    <div class="panel"><h3>What the numbers say</h3><div class="sub">Plain statements, each with its sample size.</div>${sts.length ? sts.map((x) => `<div class="statement">${x.t}${confTag(x.n)}</div>`).join('') : '<div class="empty">Patterns appear after a week or two of entries.</div>'}
      <div class="ai-box"><div class="head"><span class="spark">✦</span><b>Claude’s reading</b><span class="muted small">${ins ? 'from ' + fmtShort(ins.generatedAt.slice(0, 10)) : ''}</span><span style="flex:1"></span>${AI.ready() ? `<button class="btn sm" data-action="insights" ${s.total < 5 ? 'disabled title="Needs at least 5 entries"' : ''}>${ins ? 'Read again' : 'Read the patterns'}</button>` : '<span class="muted small">Claude is off</span>'}</div>
      ${ins ? ins.items.map((i) => `<div class="statement">${esc(i.text)}<span class="conf">${i.confidence}</span><div class="small muted">${esc(i.evidence)}</div></div>`).join('') : '<div class="muted small">Claude reads the statistics above and the last weekly reviews, and says what they suggest and what they do not.</div>'}</div></div>
    <div class="panel"><h3>Weekdays</h3><div class="sub">Mean mood by weekday; the number is how many rated entries.</div>${weekdaySVG(s.weekday)}<h3 style="margin-top:14px">Writing rhythm</h3><div class="sub">Entries per week.</div>${perWeekSVG(s.perWeek)}</div>
    <div class="panel"><h3>Mood against energy</h3><div class="sub">Each dot is an entry with both readings. Low mood splits into agitation (wired) and depletion (flat); they call for different remedies.</div>${s.quad.total ? quadrantSVG(s.both, s.quad) : '<div class="empty">Needs entries with both a mood and an energy reading.</div>'}<h3 style="margin-top:14px">Energy by time of day</h3><div class="sub">Mean energy of entries written in each part of the day.</div>${s.energyN ? energyTodSVG(s.energyTod) : ''}</div>
    <div class="panel"><h3>Themes, this month against last</h3><div class="sub">Share of entries mentioning each theme in the last 30 days, and the change.</div>${s.themeTrends.length ? `<div class="trend">${s.themeTrends.map((t) => `<span><button class="tag" style="--c:var(--k-theme)" data-action="select" data-kind="theme" data-id="${esc(t.label)}"><i></i>${esc(t.label)}</button></span><span class="d ${t.delta > 0.02 ? 'up' : t.delta < -0.02 ? 'down' : ''}">${t.delta > 0 ? '+' : ''}${Math.round(t.delta * 100)} pt</span><span class="bar" title="${t.cur} of ${s.entries30} entries this month"><i style="width:${Math.round(t.share * 100)}%"></i></span>`).join('')}</div>` : '<div class="empty">No themes yet.</div>'}</div>
    <div class="panel"><h3>Themes and mood</h3><div class="sub">Mean mood of entries mentioning a theme, against your overall ${fmtMood(s.overall)}. Association only.</div>${s.themeMood.length ? s.themeMood.map((t) => `<div class="statement" style="display:flex;align-items:center;gap:10px"><span style="min-width:120px"><button class="tag" style="--c:var(--k-theme)" data-action="select" data-kind="theme" data-id="${esc(t.label)}"><i></i>${esc(t.label)}</button></span><span style="flex:1;position:relative;height:10px;background:var(--raised);border-radius:5px"><i style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--line-strong)"></i><i style="position:absolute;top:-2px;width:14px;height:14px;border-radius:50%;background:${moodVar(Math.round(t.mean))};left:calc(${((t.mean + 2) / 4) * 100}% - 7px)"></i></span><span class="mono small" style="min-width:48px;text-align:right">${fmtMood(t.mean)}</span>${confTag(t.n)}</div>`).join('') : '<div class="empty">Needs a few rated entries per theme.</div>'}</div>
    <div class="panel"><h3>Open loops</h3><div class="sub">Questions without an answer, tasks not done, goals without a check-in, thinking left unfinished.</div>${s.loops.length ? `<ul class="list loops">${s.loops.slice(0, 14).map((l) => `<li><span class="badge soft">${l.kind}</span><span>${esc(l.text)}</span>${l.id ? `<button class="btn ghost sm" data-action="select" data-kind="entry" data-id="${l.id}">open</button>` : l.tid ? `<button class="btn ghost sm" data-action="openThread" data-id="${l.tid}">open</button>` : ''}<span class="age">${l.days}d</span></li>`).join('')}</ul>` : '<div class="empty">Nothing open. Rare.</div>'}</div>
  </div>`;
}
ACTIONS.insights = async (el) => {
  if (!AI.ready()) return; el.disabled = true; el.textContent = 'Reading…';
  try { const items = await AI.insights(statsForAI(computeStats())); await saveInsight({ key: 'w-' + weekKey(new Date()), generatedAt: new Date().toISOString(), items }); toast('Claude read the patterns.', 'good'); }
  catch (err) { toast(sampleCopy(err), 'bad'); renderPatterns(); }
};
