/* ═══════════════════════════ AI layer: prompts + calls (sample capability) ═══════════════════════════ */
const AI = {
  ready: () => !!SB.caps.sample,
  tier: () => (SB.settings.filingTier === 'default' ? 'default' : 'quick'),
};
const J = (o) => JSON.stringify(o);
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const asArr = (v) => (Array.isArray(v) ? v : []);
const strs = (v, n, max = 20) => asArr(v).map((x) => (typeof x === 'string' ? x : (x && (x.text || x.label || x.name)) || '')).map((s) => cut(s.trim(), n)).filter(Boolean).slice(0, max);
const intIn = (v, a, b) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? clamp(n, a, b) : null; };

function knownContext() {
  const themes = [...countBy(SB.entries, 'themes').values()].sort((a, b) => b.n - a.n).slice(0, 60).map((x) => x.label);
  const people = [...countBy(SB.entries, 'people').values()].sort((a, b) => b.n - a.n).slice(0, 40).map((x) => x.label);
  const projects = [...countBy(SB.entries, 'projects').values()].sort((a, b) => b.n - a.n).slice(0, 40).map((x) => x.label);
  const goals = SB.goals.filter((g) => g.status === 'active').map((g) => ({ id: g.id, label: g.label }));
  return { themes, people, projects, goals };
}
function recentForLinks(excludeId, n = 40) {
  return SB.entries.filter((e) => e.id !== excludeId && !e.example).slice(0, n).map((e) => ({ id: e.id, date: e.date, type: e.type, title: cut(e.title || e.text, 70), themes: (e.themes || []).slice(0, 3) }));
}
function instructionsBlock() { const s = (SB.settings.instructions || '').trim(); return s ? `\nStanding instructions from the writer (follow them where they apply):\n${cut(s, 1500)}\n` : ''; }

/* ─── filing: text → structured card, every judgement backed by a quote from the entry ─── */
const DOMAINS = ['work & career', 'money', 'relationships', 'family', 'friends & social', 'health & body', 'sleep', 'mind & mood', 'home & admin', 'immigration & bureaucracy', 'learning & projects', 'creativity', 'leisure', 'meaning & values'];
const VAGUE = new Set(['life', 'life impact', 'impact', 'problems', 'problem', 'stress', 'feelings', 'feeling', 'personal', 'general', 'update', 'daily life', 'stuff', 'things', 'misc', 'thoughts', 'emotions', 'situation', 'struggle', 'struggles', 'hardship', 'difficulties', 'challenges', 'pain', 'wellbeing', 'well being', 'mental health', 'negative', 'positive']);
function evidenceOk(ev, text) {
  if (!ev) return false; const words = String(ev).toLowerCase().match(/[\p{L}\p{N}']{3,}/gu) || []; if (!words.length) return false;
  const hay = text.toLowerCase(); const hit = words.filter((w) => hay.includes(w)).length; return hit / words.length >= 0.6;
}
AI.file = async function (e) {
  const ctx = knownContext(); const d = new Date(e.createdAt);
  const prompt = `You are the filing clerk of one person's private second brain: a journal of feelings, ideas, tasks, goals and questions. Read the new entry closely and return ONLY a JSON object, no prose. Every judgement must be backed by words quoted from the entry.
${instructionsBlock()}
Vocabulary already in use, for consistent spelling only (never a menu to pick from; reuse a label only when the entry is genuinely about it): themes ${J(ctx.themes)}; people ${J(ctx.people)}; projects ${J(ctx.projects)}
Active goals (id → label): ${J(ctx.goals)}
Recent entries the new one might relate to: ${J(recentForLinks(e.id))}

New entry — written ${WD_LONG[d.getDay()]} ${e.date} at ${e.time}${e.type && e.type !== 'note' ? `, the writer filed it as "${e.type}"` : ''}${e.mood && e.mood.user != null ? `, the writer set mood ${e.mood.user}` : ''}${e.energy && e.energy.user != null ? `, energy ${e.energy.user}` : ''}:
<<<
${cut(e.text, 6000)}
>>>

How to read it:
- Themes: 2 to 5 short lowercase nouns or noun phrases naming the concrete subjects of the entry, each backed by a quote: marriage, separation, immigration status, job search, rent, sleep, running. Never use catch-all labels (life, life-impact, problems, stress, feelings, personal, general, update, daily life): they say nothing and glue unrelated entries together. Stress and sadness belong in mood, not in themes. "My marriage is over and I am separating" is about marriage and separation, not about life. Reuse an existing spelling only for the same concrete subject.
- Domains: one or two from this fixed list, naming the area of life the entry belongs to: work & career, money, relationships, family, friends & social, health & body, sleep, mind & mood, home & admin, immigration & bureaucracy, learning & projects, creativity, leisure, meaning & values.
- Mood is the writer's emotional state as expressed in the text: -2 distress, despair, anger or panic; -1 low, worried, frustrated or discouraged; 0 neutral, factual or mixed; +1 content, relieved, hopeful or pleased; +2 joy, pride or excitement. null when nothing is expressed (a bare task, a neutral note). If the writer set a mood, keep it and only describe the evidence.
- Energy is physical and mental drive: 1 exhausted or drained, 2 tired, 3 ordinary, 4 lively, 5 energised; null if nothing suggests it.
- Type: journal (a narrative of the day or a reflection), feeling (mainly an emotional state), idea, task (a to-do), goal (an aim stated for the future), question (an open question the writer asks), decision (a choice made), note (anything else). Keep the writer's type if they set one.
- People: only names that appear in the text. Projects: named undertakings mentioned in the text.
- Tasks: concrete to-dos stated or clearly implied, imperative, ≤ 12 words. Questions: open questions the writer raises, ≤ 20 words.
- Links: at most 3 recent entries that are clearly related, each with a reason ≤ 12 words. Followup: one gentle question (≤ 20 words) that helps the writer think one step further, or null.

Example, for shape only. Entry: "Slept four hours again. Spent the morning dreading the call with the recruiter and then it went fine; I even laughed. Need to send the follow-up email." →
{"title":"Dreaded call went fine","type":"journal","summary":"Poor sleep and dread before a recruiter call that turned out well; a follow-up email is pending.","mood":{"value":1,"evidence":"it went fine; I even laughed"},"energy":{"value":2,"evidence":"Slept four hours again"},"themes":[{"label":"sleep","evidence":"Slept four hours again"},{"label":"job search","evidence":"call with the recruiter"},{"label":"anxiety","evidence":"dreading the call"}],"domains":["work & career","sleep"],"people":[],"projects":[],"goals":[],"new_goals":[],"tasks":["Send the follow-up email to the recruiter"],"questions":[],"links":[],"followup":"What usually happens to the dread once the feared thing is over?"}

Return exactly this shape:
{"title": "≤ 8 words, specific", "type": "journal|idea|task|goal|question|feeling|decision|note", "summary": "≤ 25 words",
 "mood": {"value": -2..2 or null, "evidence": "≤ 12 words quoted from the entry, or empty"}, "energy": {"value": 1..5 or null, "evidence": "quote or empty"},
 "themes": [{"label": "lowercase theme", "evidence": "≤ 12 words quoted from the entry"}], "domains": ["one or two from the fixed list"],
 "people": ["names as written"], "projects": ["named undertakings"], "goals": ["ids of known goals this touches"], "new_goals": [{"label": "only if the writer states a NEW goal", "why": "≤ 15 words"}],
 "tasks": ["..."], "questions": ["..."], "links": [{"to": "entry id", "reason": "≤ 12 words"}], "followup": "question or null"}
Rules: be literal; do not invent facts; evidence is quoted from the entry, not paraphrased; drop any theme you cannot back with a quote; prefer empty arrays over guesses.`;
  let out = await SB.caps.sample.json(prompt, { modelTier: AI.tier(), cache: false, purpose: 'filing' });
  const text = e.text || ''; const words = (text.match(/\S+/g) || []).length;
  const vague = (l) => VAGUE.has(slug(l).replace(/[-_]/g, ' '));
  const good = asArr(out.themes).map((t) => (typeof t === 'string' ? t : t && t.label)).filter((l) => l && !vague(l));
  if (words >= 8 && good.length < 2) {   // one more pass, with the failure named
    const second = `${prompt}\n\nYour previous answer gave these themes: ${J(asArr(out.themes).map((t) => (typeof t === 'string' ? t : t && t.label)))}. That is too few or too generic. Name the concrete subjects of this entry as 2 to 5 themes (what it is about: a relationship, a visa, a job, money, a person, a habit, a body) and return the full JSON again.`;
    try { const again = await SB.caps.sample.json(second, { modelTier: AI.tier(), cache: false, purpose: 'filing' }); if (asArr(again.themes).length >= 2) out = again; } catch (err) { /* keep the first answer */ }
  }
  const validIds = new Set(SB.entries.map((x) => x.id)); const goalIds = new Set(SB.goals.map((g) => g.id));
  const pick = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : { value: v, evidence: '' });
  const m = pick(out.mood), en = pick(out.energy);
  const themesRaw = asArr(out.themes).map((t) => (typeof t === 'string' ? { label: t, evidence: '' } : { label: String((t && t.label) || ''), evidence: String((t && t.evidence) || '') }));
  const themes = [], themeEvidence = {};
  const labelInText = (l) => l.split(/[\s&/-]+/).some((wd) => wd.length >= 4 && text.toLowerCase().includes(wd));
  for (const t of themesRaw) { const label = cut(t.label.trim().toLowerCase(), 40); if (!label || themes.includes(label) || vague(label)) continue; if (t.evidence && !evidenceOk(t.evidence, text) && !labelInText(label)) continue; themes.push(label); if (t.evidence) themeEvidence[label] = cut(t.evidence, 120); if (themes.length >= 5) break; }
  const domains = asArr(out.domains).map((d) => String(d || '').toLowerCase().trim()).map((d) => DOMAINS.find((x) => x === d || x.startsWith(d.split(' ')[0]) && d.length > 3) || null).filter((d, i, arr) => d && arr.indexOf(d) === i).slice(0, 2);
  const people = strs(out.people, 40, 10).filter((n) => text.toLowerCase().includes(n.split(/\s+/)[0].toLowerCase().replace(/[.,]/g, '')));
  return {
    title: cut(String(out.title || '').trim(), 80) || cut(text.split(/\n/)[0], 60),
    type: TYPES.includes(out.type) ? out.type : (e.type && e.type !== 'note' ? e.type : 'note'),
    summary: cut(String(out.summary || '').trim(), 200),
    mood: intIn(m.value, -2, 2), moodEvidence: cut(String(m.evidence || ''), 120), energy: intIn(en.value, 1, 5), energyEvidence: cut(String(en.evidence || ''), 120),
    themes, themeEvidence, domains, people, projects: strs(out.projects, 50, 6),
    goals: asArr(out.goals).map(String).filter((id) => goalIds.has(id)),
    new_goals: asArr(out.new_goals).map((g) => ({ label: cut(String((g && g.label) || '').trim(), 80), why: cut(String((g && g.why) || '').trim(), 160) })).filter((g) => g.label).slice(0, 2),
    tasks: strs(out.tasks, 120, 8), questions: strs(out.questions, 160, 5),
    links: asArr(out.links).map((l) => ({ to: String((l && l.to) || ''), reason: cut(String((l && l.reason) || '').trim(), 100) })).filter((l) => validIds.has(l.to) && l.to !== e.id).slice(0, 3),
    followup: out.followup ? cut(String(out.followup).trim(), 160) : null,
  };
};

/* ─── link finding on demand ─── */
AI.findLinks = async function (e) {
  const s = new Set((e.themes || []).map(slug)); const p = new Set((e.people || []).map(slug)); const pr = new Set((e.projects || []).map(slug));
  const cands = SB.entries.filter((x) => x.id !== e.id && !x.example).map((x) => ({ x, score: (x.themes || []).filter((t) => s.has(slug(t))).length * 2 + (x.people || []).filter((t) => p.has(slug(t))).length * 3 + (x.projects || []).filter((t) => pr.has(slug(t))).length * 2 }))
    .sort((a, b) => b.score - a.score || b.x.ts - a.x.ts).slice(0, 30).map(({ x }) => ({ id: x.id, date: x.date, type: x.type, title: cut(x.title || x.text, 80), summary: cut(x.summary || x.text, 160), themes: x.themes || [] }));
  if (!cands.length) return [];
  const prompt = `Find the entries in a personal journal that genuinely relate to a target entry. Return ONLY a JSON array of at most 5 objects {"to": id, "reason": "≤ 12 words"} — an empty array if nothing is clearly related. Prefer links that would help the writer see a pattern (same struggle recurring, a question answered later, a goal and an action).
Target entry (${e.date}, ${e.type}): ${cut(e.title, 80)} — ${cut(e.text, 1500)}
Candidates: ${J(cands)}`;
  const out = await SB.caps.sample.json(prompt, { modelTier: AI.tier(), cache: false, purpose: 'links' });
  const ids = new Set(cands.map((c) => c.id));
  return asArr(out).map((l) => ({ to: String((l && l.to) || ''), reason: cut(String((l && l.reason) || '').trim(), 100) })).filter((l) => ids.has(l.to)).slice(0, 5);
};

/* ─── weekly review ─── */
function entriesInRange(from, to) { const a = dateKey(from), b = dateKey(to); return SB.entries.filter((e) => e.date >= a && e.date <= b).sort((x, y) => x.ts - y.ts); }
function entryForPrompt(e, textChars = 700) {
  return { id: e.id, date: e.date, time: e.time, type: e.type, title: e.title, mood: effMood(e), energy: effEnergy(e), themes: e.themes, people: e.people, projects: e.projects, goals: (e.goals || []).map(goalLabel), tasks: (e.tasks || []).map((t) => (t.done ? '✓ ' : '○ ') + t.text), questions: (e.questions || []).map((q) => (q.resolved ? '✓ ' : '? ') + q.text), text: cut(e.text, textChars) };
}
AI.weekly = async function (key) {
  const { from, to } = weekRange(key); const list = entriesInRange(from, to);
  const prevKey = weekKey(addDays(from, -7)); const prev = SB.digests.get('w-' + prevKey);
  const goals = SB.goals.map((g) => ({ id: g.id, label: g.label, status: g.status, lastCheckin: g.checkins && g.checkins.length ? g.checkins[g.checkins.length - 1] : null }));
  const prompt = `You write the weekly review for one person's private journal. Speak to the writer in the second person, warmly but plainly, no flattery, no therapy clichés. Ground every claim in the entries; when you cite a pattern, give the count. Return ONLY JSON.
${instructionsBlock()}
Week ${key}: ${dateKey(from)} to ${dateKey(to)}. Entries this week (${list.length}): ${J(list.map((e) => entryForPrompt(e)))}
Goals: ${J(goals)}
${prev ? `Previous week's review (for continuity): ${J(prev.data)}` : 'No previous review exists.'}

Return exactly:
{"headline": "≤ 12 words naming the week's shape",
 "narrative": "80-140 words: what happened, what mattered, what you noticed",
 "mood_summary": "≤ 20 words with the numbers (e.g. mean mood, lowest day)",
 "themes": [{"label": "theme", "note": "≤ 15 words"}] (max 5),
 "wins": ["≤ 12 words"] (max 4),
 "struggles": ["≤ 12 words"] (max 4),
 "open_loops": [{"text": "unresolved question or undone task", "since": "YYYY-MM-DD"}] (max 6),
 "goals": [{"id": "goal id", "note": "≤ 20 words on movement or stall"}],
 "patterns": ["≤ 20 words each, with counts, only if the entries support them"] (max 3),
 "question": "one question worth sitting with next week, ≤ 25 words"}`;
  const data = await SB.caps.sample.json(prompt, { modelTier: 'default', cache: false, purpose: 'weekly' });
  return { key: 'w-' + key, kind: 'week', from: dateKey(from), to: dateKey(to), entryIds: list.map((e) => e.id), data: normaliseDigest(data), generatedAt: new Date().toISOString() };
};
function normaliseDigest(d) {
  d = d && typeof d === 'object' ? d : {};
  return { headline: cut(String(d.headline || ''), 120), narrative: cut(String(d.narrative || ''), 1600), mood_summary: cut(String(d.mood_summary || ''), 200),
    themes: asArr(d.themes).map((t) => ({ label: cut(String((t && t.label) || t || ''), 60), note: cut(String((t && t.note) || ''), 160) })).filter((t) => t.label).slice(0, 6),
    wins: strs(d.wins, 120, 5), struggles: strs(d.struggles, 120, 5),
    open_loops: asArr(d.open_loops).map((o) => ({ text: cut(String((o && o.text) || o || ''), 160), since: String((o && o.since) || '') })).filter((o) => o.text).slice(0, 8),
    goals: asArr(d.goals).map((g) => ({ id: String((g && g.id) || ''), note: cut(String((g && g.note) || ''), 200) })).filter((g) => g.note).slice(0, 8),
    patterns: strs(d.patterns, 200, 5), question: cut(String(d.question || ''), 240),
    shifts: strs(d.shifts, 200, 5), advice: cut(String(d.advice || ''), 240) };
}
/* ─── monthly themes from weekly digests ─── */
AI.monthly = async function (mkey) {
  const weeks = [...SB.digests.values()].filter((d) => d.kind === 'week' && (d.from.slice(0, 7) === mkey || d.to.slice(0, 7) === mkey)).sort((a, b) => a.from.localeCompare(b.from));
  const list = SB.entries.filter((e) => e.date.slice(0, 7) === mkey);
  const counts = [...countBy(list, 'themes').values()].sort((a, b) => b.n - a.n).slice(0, 15).map((t) => [t.label, t.n]);
  const moods = list.map(effMood).filter((m) => m != null);
  const prompt = `You write the monthly reflection for one person's private journal, from their weekly reviews and counts. Second person, plain, grounded; cite counts. Return ONLY JSON.
${instructionsBlock()}
Month ${mkey}. Entries: ${list.length}. Mean mood: ${mean(moods) == null ? 'n/a' : mean(moods).toFixed(2)} over ${moods.length} rated entries. Theme counts: ${J(counts)}
Weekly reviews: ${J(weeks.map((w) => ({ week: w.key, ...w.data })))}
${weeks.length === 0 ? 'There are no weekly reviews yet; work from the counts and the sampled entries: ' + J(list.slice(0, 25).map((e) => entryForPrompt(e, 300))) : ''}

Return exactly:
{"headline": "≤ 12 words",
 "narrative": "100-160 words on the month's arc",
 "themes": [{"label": "theme", "note": "rising, fading or steady, and why (≤ 20 words)"}] (max 6),
 "shifts": ["a change between early and late month, ≤ 25 words, with evidence"] (max 4),
 "open_loops": [{"text": "what is still unresolved", "since": "YYYY-MM-DD or empty"}] (max 5),
 "advice": "one concrete, modest suggestion for next month (≤ 30 words)",
 "question": "one question for next month (≤ 25 words)"}`;
  const data = await SB.caps.sample.json(prompt, { modelTier: 'default', cache: false, purpose: 'monthly' });
  const [y, m] = mkey.split('-').map(Number); const from = new Date(y, m - 1, 1), to = new Date(y, m, 0);
  return { key: 'm-' + mkey, kind: 'month', from: dateKey(from), to: dateKey(to), entryIds: list.map((e) => e.id), data: normaliseDigest(data), generatedAt: new Date().toISOString() };
};

/* ─── pattern narration from computed statistics ─── */
AI.insights = async function (stats) {
  const weeks = [...SB.digests.values()].filter((d) => d.kind === 'week').sort((a, b) => b.from.localeCompare(a.from)).slice(0, 4).map((w) => ({ week: w.key, headline: w.data.headline, patterns: w.data.patterns, struggles: w.data.struggles }));
  const prompt = `You read the statistics computed from one person's journal and say what they suggest, carefully. Small samples: say "suggestive" when n < 8, "moderate" when n < 20, "strong" only beyond that and when the effect is large. Never invent numbers; quote the ones given. Second person, plain. Return ONLY JSON.
${instructionsBlock()}
Statistics: ${J(stats)}
Recent weekly reviews: ${J(weeks)}

Return exactly: {"insights": [{"text": "≤ 35 words, one observation with its numbers", "evidence": "which statistic (its key or the counts)", "confidence": "suggestive|moderate|strong"}]} with at most 6 insights, ordered by usefulness, and at least one that questions a tempting but weak conclusion.`;
  const out = await SB.caps.sample.json(prompt, { modelTier: 'default', cache: false, purpose: 'insights' });
  return asArr(out && out.insights).map((i) => ({ text: cut(String((i && i.text) || ''), 300), evidence: cut(String((i && i.evidence) || ''), 160), confidence: ['suggestive', 'moderate', 'strong'].includes(i && i.confidence) ? i.confidence : 'suggestive' })).filter((i) => i.text).slice(0, 6);
};

/* ─── think it through: one Socratic question at a time ─── */
function threadTurns(t) {
  const turns = [];
  for (const s of t.steps) { if (s.role === 'claude') turns.push({ role: 'assistant', content: s.text }); else turns.push({ role: 'user', content: (s.role === 'note' ? '(note to self) ' : '') + s.text }); }
  return turns;
}
AI.thinkQuestion = async function (t) {
  const stage = STAGES[t.stage] || STAGES[0];
  const rules = `You are a Socratic thinking partner. The writer is working through ONE problem in written steps, the way one writes out a long calculation instead of holding it in the head. Stages, in order: ${STAGES.join(' → ')}. Current stage: "${stage}". Ask exactly ONE question (≤ 35 words) that helps them take the next concrete step in this stage. No advice, no summary, no praise, no preamble; do not repeat a question already asked. If the stage is "Decision", ask what they will decide and why; if it is "Next step", ask for the smallest action and when.${instructionsBlock()}`;
  const turns = [{ role: 'user', content: rules }, ...threadTurns(t), { role: 'user', content: `(Continue. Current stage: "${stage}". Ask your one question now.)` }];
  const { text } = await SB.caps.sample(turns, { modelTier: 'default', cache: false, purpose: 'think' });
  return cut(text.trim(), 400);
};
AI.thinkSummary = async function (t) {
  const prompt = `Summarise a finished piece of written thinking into a decision record. Return ONLY JSON: {"title": "≤ 8 words", "decision": "≤ 30 words, in the writer's voice", "nextStep": "smallest concrete action with a when, ≤ 25 words", "summary": "≤ 60 words of the reasoning", "facts": ["≤ 12 words each"] (max 5), "options": ["each option considered, ≤ 8 words"] (max 5)}. Use only what the writer wrote; where they decided nothing, say so in "decision".
Problem: ${cut(t.problem, 800)}
Steps: ${J(t.steps.map((s) => ({ who: s.role, stage: STAGES[s.stage] || '', text: cut(s.text, 700) })))}`;
  const o = await SB.caps.sample.json(prompt, { modelTier: 'default', cache: false, purpose: 'think_summary' });
  return { title: cut(String(o.title || t.title || 'Decision'), 80), decision: cut(String(o.decision || ''), 240), nextStep: cut(String(o.nextStep || ''), 200), summary: cut(String(o.summary || ''), 500), facts: strs(o.facts, 100, 5), options: strs(o.options, 80, 5) };
};

/* ─── heads-up: plain-words interpretation, cautious forecasts, warnings ─── */
AI.headsup = async function (payload) {
  const prompt = `You read one person's private journal data and tell them, in plain words and in the second person, what it says about their life right now. No therapy clichés, no diagnosis, no flattery. Every claim cites the numbers or dates it rests on. Where the data is thin, say so. Forecasts are conditional ("if the last three weeks continue…") and modest. Warnings only when the entries support them. If any entry suggests a danger to the writer's safety, say so plainly in heads_up with level "warning" and point them to a professional or local emergency help; otherwise never moralise. Return ONLY JSON.
${instructionsBlock()}
Today: ${payload.today}. Statistics: ${J(payload.stats)}
Automatic flags already computed by the page (do not merely repeat them; add what they miss): ${J(payload.flags)}
Constellations (groups of themes that co-occur): ${J(payload.clusters)}
Recent entries (last 14 days): ${J(payload.recent)}
Goals: ${J(payload.goals)}
Open loops: ${J(payload.loops)}
${payload.lastReview ? 'Last weekly review: ' + J(payload.lastReview) : 'No weekly review exists yet.'}

Return exactly:
{"state": "2-4 sentences: where you are right now according to the entries",
 "in_play": [{"theme": "name", "reading": "≤ 25 words", "trend": "rising|steady|fading"}] (max 5),
 "heads_up": [{"text": "≤ 35 words", "level": "warning|watch|good", "evidence": "counts or dates", "confidence": "suggestive|moderate|strong"}] (max 6),
 "forecast": [{"text": "≤ 30 words, conditional", "horizon": "next week|next month", "basis": "≤ 15 words", "confidence": "low|medium"}] (max 3),
 "suggestions": ["≤ 20 words, concrete and small"] (max 3),
 "blind_spots": ["≤ 25 words: what is missing or contradictory, e.g. a goal with no entries, a theme that vanished, said versus done"] (max 3),
 "question": "one question worth writing about, ≤ 25 words"}`;
  const o = await SB.caps.sample.json(prompt, { modelTier: 'default', cache: false, purpose: 'headsup' });
  const lvl = (v) => (['warning', 'watch', 'good'].includes(v) ? v : 'watch');
  return { state: cut(String(o.state || ''), 900),
    in_play: asArr(o.in_play).map((t) => ({ theme: cut(String((t && t.theme) || ''), 60), reading: cut(String((t && t.reading) || ''), 200), trend: ['rising', 'steady', 'fading'].includes(t && t.trend) ? t.trend : 'steady' })).filter((t) => t.theme).slice(0, 5),
    heads_up: asArr(o.heads_up).map((h) => ({ text: cut(String((h && h.text) || ''), 300), level: lvl(h && h.level), evidence: cut(String((h && h.evidence) || ''), 160), confidence: ['suggestive', 'moderate', 'strong'].includes(h && h.confidence) ? h.confidence : 'suggestive' })).filter((h) => h.text).slice(0, 6),
    forecast: asArr(o.forecast).map((f) => ({ text: cut(String((f && f.text) || ''), 240), horizon: cut(String((f && f.horizon) || 'next week'), 30), basis: cut(String((f && f.basis) || ''), 120), confidence: (f && f.confidence) === 'medium' ? 'medium' : 'low' })).filter((f) => f.text).slice(0, 3),
    suggestions: strs(o.suggestions, 160, 3), blind_spots: strs(o.blind_spots, 200, 3), question: cut(String(o.question || ''), 240) };
};
