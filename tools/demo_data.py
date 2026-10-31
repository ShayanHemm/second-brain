#!/usr/bin/env python3
"""Compose a fictional eight-week journal in the app's export format: demo/second-brain-demo.json.

Entries are assembled from short templates about ordinary days (work on a robotics demo, running, German
practice, a side project, friends, chores). The persona and every name are invented.
"""
import datetime as dt, json, pathlib, random
random.seed(11)
OUT = pathlib.Path(__file__).resolve().parent.parent / "demo" / "second-brain-demo.json"
TODAY = dt.date.today(); START = TODAY - dt.timedelta(days=55)
G_RUN, G_BIRD, G_DE = "g_half", "g_bird", "g_german"
WORK, RUN, DE, CLIMB, COOK, BIRD, ADMIN, SOCIAL, REST, SLEEP = range(10)

T = {  # text, type, themes, domains, people, projects, goals, mood centre, energy centre
    WORK: [("Spent the day on the perception pipeline; two bugs fewer than yesterday.", "journal", ["perception pipeline", "debugging"], ["work & career"], [], ["Q4 demo"], [], 1, 3),
           ("Gripper controller rewritten; the cup still slips at one joint angle.", "journal", ["gripper controller", "debugging"], ["work & career"], [], ["Q4 demo"], [], -1, 3),
           ("Found the cup problem: camera latency, not the gripper. Amir had hinted at it on Monday.", "journal", ["debugging", "camera latency"], ["work & career"], ["Amir"], ["Q4 demo"], [], 1, 3),
           ("Demo rehearsal: the robot behaved three times out of four, our best ratio yet.", "journal", ["q4 demo", "rehearsal"], ["work & career"], ["Amir"], ["Q4 demo"], [], 1, 3),
           ("Demo day. The cup was lifted, moved and placed; the investors applauded. Beer with the team afterwards.", "journal", ["q4 demo", "celebration"], ["work & career", "friends & social"], ["Amir"], ["Q4 demo"], [], 2, 3),
           ("Mostly code review today; closed three threads and opened one.", "journal", ["code review"], ["work & career"], [], [], [], 0, 3),
           ("Wrote tests for the latency path so the cup problem cannot return quietly.", "journal", ["testing", "perception pipeline"], ["work & career"], [], ["Q4 demo"], [], 1, 3),
           ("Kickoff for the second arm. Eight months on paper, which is honest.", "journal", ["second arm plan", "planning"], ["work & career"], [], ["Second arm plan"], [], 1, 3),
           ("Interviewed two candidates for the second-arm team; one asked better questions than I would have.", "journal", ["hiring", "second arm plan"], ["work & career"], [], ["Second arm plan"], [], 1, 3),
           ("Planning meeting for the demo ran long; we cut the gripper showcase and kept the pick-and-place.", "journal", ["q4 demo", "meetings"], ["work & career"], ["Amir"], ["Q4 demo"], [], 0, 2)],
    RUN: [("Ran {km} km along the lake with Lena. Knee quiet.", "journal", ["running", "friendship"], ["health & body", "friends & social"], ["Lena"], [], [G_RUN], 2, 4),
          ("Short run, {km} km by the river, slow on purpose.", "journal", ["running", "knee"], ["health & body"], [], [], [G_RUN], 1, 3),
          ("Lunch run, {km} km. Pace decent without trying.", "journal", ["running"], ["health & body"], [], [], [G_RUN], 1, 4),
          ("Knee exercises done, day {n} of the boring routine.", "note", ["knee", "habits"], ["health & body"], [], [], [G_RUN], 0, 3)],
    DE: [("German practice, {m} minutes on the tram. Dative still slippery.", "note", ["german"], ["learning & projects"], [], ["German B1"], [G_DE], 0, 3),
         ("German class: understood a whole joke about Swiss trains and laughed at the right moment.", "journal", ["german", "small wins"], ["learning & projects"], [], ["German B1"], [G_DE], 2, 3),
         ("Did the German homework at the last minute again. Same pattern as the knee exercises.", "journal", ["german", "procrastination"], ["learning & projects", "mind & mood"], [], ["German B1"], [G_DE], -1, 2),
         ("Vocabulary cards done, {m} minutes. No drama.", "note", ["german", "habits"], ["learning & projects"], [], ["German B1"], [G_DE], 1, 3)],
    CLIMB: [("Climbing with Lena after work. Forearms gone, mood up.", "journal", ["climbing", "friendship"], ["health & body", "friends & social"], ["Lena"], [], [], 2, 3),
            ("Climbing with Lena and Amir; his first time, cheerfully bad at it.", "journal", ["climbing", "friendship"], ["friends & social", "health & body"], ["Lena", "Amir"], [], [], 2, 3)],
    COOK: [("Cooked the lentil dish Mum makes and froze half for the week.", "journal", ["cooking", "family"], ["home & admin", "family"], ["Mum"], [], [], 1, 3),
           ("Crisps for dinner at the desk. Not a pattern I want.", "note", ["food", "overwork"], ["health & body", "work & career"], [], [], [], -1, 2),
           ("Proper eggs, proper coffee, newspaper. Slow start.", "journal", ["rest", "cooking"], ["leisure"], [], [], [], 1, 3)],
    BIRD: [("Birdsong classifier: labelled forty clips on the train.", "note", ["birdsong classifier", "side project"], ["learning & projects", "creativity"], [], ["Birdsong classifier"], [G_BIRD], 1, 3),
           ("Recorded the dawn chorus from the balcony: blackbirds and one loud magpie.", "journal", ["birdsong classifier", "early mornings"], ["learning & projects", "creativity"], [], ["Birdsong classifier"], [G_BIRD], 2, 3),
           ("First birdsong model: 71 percent accuracy, and it confuses exactly the two thrushes I confuse.", "journal", ["birdsong classifier", "machine learning"], ["learning & projects"], ["Amir"], ["Birdsong classifier"], [G_BIRD], 2, 4),
           ("Idea: record the dawn chorus for two weeks instead of scraping random clips. Smaller data, real labels.", "idea", ["birdsong classifier", "side project"], ["learning & projects", "creativity"], [], ["Birdsong classifier"], [G_BIRD], 1, 4)],
    ADMIN: [("Did the monthly budget. Rent up by ninety francs; still saving a little.", "journal", ["money", "budgeting", "rent"], ["money", "home & admin"], [], [], [], 0, 3),
            ("Booked Dr. Keller for the knee before the long runs get longer.", "task", ["knee", "physio"], ["health & body"], ["Dr. Keller"], [], [G_RUN], None, None),
            ("Physio: an irritated tendon, nothing torn. Two weeks of shorter runs.", "journal", ["knee", "physio"], ["health & body"], ["Dr. Keller"], [], [G_RUN], 0, 3),
            ("Bought proper earplugs and wrote a polite note to the upstairs neighbours.", "journal", ["sleep", "neighbours"], ["sleep", "home & admin"], [], [], [], 1, 3),
            ("Laundry done on Saturday on purpose, as an experiment against Sunday evenings.", "note", ["sundays", "experiments", "home"], ["home & admin", "mind & mood"], [], [], [], 1, 3)],
    SOCIAL: [("Called Mum; she asked about the demo twice and about the knee once.", "journal", ["family"], ["family"], ["Mum"], [], [], 1, 3),
             ("Coffee with Lena. She moves to Basel in January; I am sad about it in advance.", "journal", ["friendship", "change"], ["friends & social"], ["Lena"], [], [], 0, 3),
             ("Recruiter wrote about a perception role elsewhere. Parking it until after the demo.", "question", ["career", "job offer"], ["work & career"], [], [], [], 0, 3),
             ("Talked to the recruiter. Forty percent more money, a roadmap decided elsewhere.", "journal", ["career", "job offer", "money"], ["work & career", "money"], [], [], [], 0, 3),
             ("Declined the recruiter. I would rather build the second arm slowly than maintain someone else's first one.", "decision", ["career", "job offer", "startup"], ["work & career"], ["Amir"], [], [], 2, 4)],
    REST: [("Slow Sunday: read in bed, laundry, fifteen minutes of German. Nothing heavy tonight.", "journal", ["rest", "german"], ["leisure", "learning & projects"], [], ["German B1"], [G_DE], 1, 3),
           ("Sunday evening heaviness, milder than last week. It arrives with the empty fridge, not with any thought about work.", "feeling", ["sundays", "rumination"], ["mind & mood"], [], [], [], -1, 2)],
    SLEEP: [("Slept {h} hours. Sharp all morning.", "note", ["sleep"], ["sleep"], [], [], [], 1, 4),
            ("Slept {h} hours; neighbours until two. Foggy until lunch.", "note", ["sleep", "neighbours"], ["sleep"], [], [], [], -1, 1),
            ("Woke at four and stayed awake. Not worried about anything in particular.", "feeling", ["sleep", "insomnia"], ["sleep"], [], [], [], -1, 1)],
}
WEEK_PLAN = {0: [RUN, WORK, DE, WORK, BIRD, CLIMB, REST], 1: [WORK, SLEEP, WORK, SOCIAL, WORK, COOK, REST], 2: [WORK, WORK, ADMIN, DE, BIRD, RUN, REST], 3: [WORK, SLEEP, ADMIN, SOCIAL, ADMIN, RUN, REST], 4: [SOCIAL, BIRD, DE, WORK, CLIMB, COOK, REST], 5: [SOCIAL, RUN, WORK, DE, WORK, RUN, REST], 6: [WORK, SLEEP, BIRD, DE, RUN, SOCIAL, REST], 7: [WORK, DE, RUN, COOK, WORK, CLIMB, REST]}
used = {k: 0 for k in T}

def pick(cat):
    opts = T[cat]; i = used[cat] % len(opts); used[cat] += 1; return opts[i]

def make_entry(day, time, cat, week):
    text, typ, themes, domains, people, projects, goals, mood_c, energy_c = pick(cat)
    text = text.format(km=random.choice([5, 6, 8, 10, 12, 14]), m=random.choice([15, 20, 25]), h=random.choice([4, 5, 7, 8]), n=random.randint(3, 14))
    sunday = day.weekday() == 6; crunch = week in (1, 2)
    mood = None if mood_c is None else max(-2, min(2, mood_c + random.choice([-1, 0, 0, 0, 1]) - (1 if sunday and cat == REST else 0) - (1 if crunch and cat == WORK else 0)))
    energy = None if energy_c is None else max(1, min(5, energy_c + random.choice([-1, 0, 0, 1]) - (1 if crunch else 0)))
    ts = int(dt.datetime(day.year, day.month, day.day, *map(int, time.split(":"))).timestamp() * 1000); eid = f"e_{ts:x}"
    iso = dt.datetime(day.year, day.month, day.day, *map(int, time.split(":"))).isoformat() + ".000Z"
    first = " ".join(text.split()[:6]).rstrip(".,;")
    tasks, questions = [], []
    if typ == "task": tasks = [{"id": f"t_{eid}", "text": text.rstrip("."), "done": random.random() < 0.6}]
    if typ == "question": questions = [{"id": f"q_{eid}", "text": "Do I want less chaos, or do I want this week to end?", "resolved": False}]
    return {"id": eid, "createdAt": iso, "updatedAt": iso, "ts": ts, "date": day.isoformat(), "time": time, "type": typ, "title": first, "text": text, "summary": "",
            "mood": {"ai": mood, "user": None, "evidence": first if mood is not None else ""}, "energy": {"ai": energy, "user": None, "evidence": ""},
            "themes": themes, "themeEvidence": {themes[0]: first}, "domains": domains, "people": people, "projects": projects, "goals": goals,
            "tasks": tasks, "questions": questions, "links": [], "followup": None, "attachments": [], "filing": "done", "edited": False, "example": True}

entries = []
for week in range(8):
    for dow, cat in enumerate(WEEK_PLAN[week]):
        day = START + dt.timedelta(days=week * 7 + dow)
        if day > TODAY or (random.random() < 0.15 and cat not in (REST,)):
            continue
        time = random.choice(["07:40", "12:30", "18:20", "21:10", "22:40"]) if cat != SLEEP else "07:30"
        entries.append(make_entry(day, time, cat, week))
        if cat == WORK and random.random() < 0.35:   # a second, shorter note on busy days
            entries.append(make_entry(day, "22:55", random.choice([SLEEP, COOK, DE]), week))
entries.sort(key=lambda e: e["ts"])
# a few accepted links: question → decision, idea → model, earplugs → sleep
def find(pred):
    return next((e for e in entries if pred(e)), None)
q = find(lambda e: e["type"] == "question"); d = find(lambda e: e["type"] == "decision"); idea = find(lambda e: e["type"] == "idea"); model = find(lambda e: "71 percent" in e["text"])
plugs = find(lambda e: "earplugs" in e["text"]); sharp = find(lambda e: "Sharp all morning" in e["text"] and (not plugs or e["ts"] > plugs["ts"]))
for a, b, why in [(d, q, "answers the question parked before the demo"), (model, idea, "the dawn-chorus idea, tried"), (sharp, plugs, "sleep improved after the earplugs")]:
    if a and b and a is not b: a["links"].append({"to": b["id"], "reason": why, "status": "accepted"})
if entries: entries[-1]["links"].append({"to": entries[-3]["id"], "reason": "same theme two days apart", "status": "proposed"})
# goals, threads, reviews, readings
tnow = (TODAY - dt.timedelta(days=1)).isoformat() + "T20:00:00.000Z"
goals = [{"id": G_RUN, "label": "Run the April half marathon", "why": "A long goal that makes the short runs mean something.", "status": "active", "createdAt": START.isoformat() + "T08:00:00.000Z", "checkins": [{"at": (START + dt.timedelta(days=20)).isoformat() + "T20:00:00.000Z", "note": "14 km done; knee needs care.", "progress": 30}, {"at": (START + dt.timedelta(days=48)).isoformat() + "T20:00:00.000Z", "note": "12 km pain-free after the physio weeks.", "progress": 45}], "lastTouched": tnow, "example": True},
         {"id": G_BIRD, "label": "Ship the birdsong classifier write-up", "why": "Finish one side project properly.", "status": "active", "createdAt": START.isoformat() + "T08:00:00.000Z", "checkins": [{"at": (START + dt.timedelta(days=30)).isoformat() + "T20:00:00.000Z", "note": "First model trained on own recordings.", "progress": 40}], "lastTouched": tnow, "example": True},
         {"id": G_DE, "label": "German B1 exam in March", "why": "Two years of vague learning; an exam date is the commitment.", "status": "active", "createdAt": (START + dt.timedelta(days=33)).isoformat() + "T08:00:00.000Z", "checkins": [], "lastTouched": tnow, "example": True}]
threads = [{"id": "th_demo_1", "title": "Take the recruiter's offer or stay?", "problem": "A perception role elsewhere pays forty percent more; the work is maintenance of a mature system.", "createdAt": (START + dt.timedelta(days=28)).isoformat() + "T21:00:00.000Z", "updatedAt": (START + dt.timedelta(days=36)).isoformat() + "T21:30:00.000Z", "status": "decided", "stage": 5, "example": True,
            "steps": [{"role": "me", "stage": 0, "text": "A perception role elsewhere pays forty percent more; the work is maintenance of a mature system.", "at": ""}, {"role": "claude", "stage": 1, "text": "What do you know for certain about the day-to-day of each job, as opposed to what you imagine?", "at": ""}, {"role": "me", "stage": 1, "text": "Here: I decide what to build and fix my own mistakes. There: the roadmap is set, the system works, the pay is better.", "at": ""}, {"role": "claude", "stage": 2, "text": "If money were equal, which option would you be explaining to a friend with more energy?", "at": ""}, {"role": "me", "stage": 2, "text": "The second arm, without hesitation.", "at": ""}, {"role": "claude", "stage": 4, "text": "What will you decide, and what is the one sentence you would give the recruiter?", "at": ""}, {"role": "me", "stage": 4, "text": "Staying. I would rather build the second arm slowly than maintain someone else's first one.", "at": ""}],
            "outcome": {"title": "Stay and build the second arm", "decision": "Decline the offer and stay.", "nextStep": "Reply to the recruiter tomorrow morning.", "summary": "The pay difference is real; the work difference is bigger. Revisit in six months if the plan slips.", "facts": ["Forty percent more pay", "Maintenance role, roadmap set elsewhere"], "options": ["Take the offer", "Stay", "Negotiate a raise"]}},
           {"id": "th_demo_2", "title": "Keep the early recordings or protect sleep?", "problem": "Dawn recordings for the side project cost an hour of sleep three mornings a week.", "createdAt": (TODAY - dt.timedelta(days=5)).isoformat() + "T22:00:00.000Z", "updatedAt": (TODAY - dt.timedelta(days=5)).isoformat() + "T22:10:00.000Z", "status": "open", "stage": 1, "example": True,
            "steps": [{"role": "me", "stage": 0, "text": "Dawn recordings for the side project cost an hour of sleep three mornings a week.", "at": ""}, {"role": "claude", "stage": 1, "text": "How many clips do you actually still need, and how many mornings would that take?", "at": ""}], "outcome": None}]
def week_key(d):
    y, w, _ = d.isocalendar(); return f"{y}-W{w:02d}"
def digest(kind, key, es, frm, to):
    moods = [e["mood"]["ai"] for e in es if e["mood"]["ai"] is not None]; mm = sum(moods) / len(moods) if moods else 0
    counts = {}
    for e in es:
        for t in e["themes"]: counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda x: -x[1])[:4]
    wins = [e["title"] for e in es if (e["mood"]["ai"] or 0) >= 2][:3]; hard = [e["title"] for e in es if (e["mood"]["ai"] or 0) <= -1][:3]
    data = {"headline": f"{top[0][0].capitalize()} week" if top else "A quiet stretch", "narrative": f"{len(es)} entries, mean mood {mm:+.1f}. Most of the writing was about {', '.join(t for t, _ in top[:3])}. The good days came from running and the side project; the harder ones from sleep and the demo deadline.", "mood_summary": f"mean mood {mm:+.1f} over {len(moods)} rated entries", "themes": [{"label": t, "note": f"{n} entries"} for t, n in top], "wins": wins, "struggles": hard, "open_loops": [{"text": q["text"], "since": e["date"]} for e in es for q in e["questions"] if not q["resolved"]][:3], "goals": [{"id": G_RUN, "note": "Distance up, knee managed with the physio routine."}], "patterns": [f"Sunday entries average lower than the rest of the week ({sum(1 for e in es if dt.date.fromisoformat(e['date']).weekday() == 6)} of them)."], "question": "Which of this week's good days could you schedule on purpose next week?", "shifts": [], "advice": "Protect the sleep the early recordings are eating."}
    return {"key": key, "id": key, "kind": kind, "from": frm.isoformat(), "to": to.isoformat(), "entryIds": [e["id"] for e in es], "data": data, "generatedAt": (to + dt.timedelta(days=1)).isoformat() + "T08:00:00.000Z", "example": True}
digests = []
for back in (1, 2):
    mon = TODAY - dt.timedelta(days=TODAY.weekday() + 7 * back); sun = mon + dt.timedelta(days=6); es = [e for e in entries if mon.isoformat() <= e["date"] <= sun.isoformat()]
    if es: digests.append(digest("week", "w-" + week_key(mon), es, mon, sun))
lm = (TODAY.replace(day=1) - dt.timedelta(days=1)); first = lm.replace(day=1); es = [e for e in entries if first.isoformat() <= e["date"] <= lm.isoformat()]
if es: digests.append(digest("month", f"m-{lm.strftime('%Y-%m')}", es, first, lm))
headsup = [{"key": TODAY.isoformat(), "id": TODAY.isoformat(), "generatedAt": TODAY.isoformat() + "T08:30:00.000Z", "example": True, "data": {"state": "Eight weeks in, the journal shows a demo crunch in the middle, a recovery driven by running and the side project, and a sleep debt that keeps coming back through the neighbours and the early recordings. The career question is settled; the sleep question is not.", "in_play": [{"theme": "running", "reading": "Distance up and knee quiet since the physio routine.", "trend": "rising"}, {"theme": "sleep", "reading": "Better after the earplugs, undercut by the dawn recordings.", "trend": "steady"}, {"theme": "german", "reading": "Daily practice is real now that an exam date exists.", "trend": "rising"}], "heads_up": [{"text": "Three of the last seven entries were written after 22:30 with energy at 2 or below.", "level": "watch", "evidence": "entries by time and energy", "confidence": "suggestive"}, {"text": "Sunday entries average −0.7 against +0.6 for the rest of the week.", "level": "watch", "evidence": "weekday profile", "confidence": "moderate"}, {"text": "Eleven consecutive days with an entry.", "level": "good", "evidence": "writing streak", "confidence": "strong"}], "forecast": [{"text": "If the dawn recordings continue three mornings a week, expect another low-energy stretch within a fortnight.", "horizon": "next week", "basis": "energy after early starts", "confidence": "low"}], "suggestions": ["Decide how many clips the classifier still needs and stop recording when you have them.", "Move the laundry to Saturday every week, since the one experiment coincided with a lighter Sunday."], "blind_spots": ["The German goal has no check-in yet.", "Money appears only when the budget is done; nothing about the raise that was never asked for."], "question": "What would a Sunday look like if you designed it instead of letting it happen?"}}]
insights = [{"key": "w-" + week_key(TODAY), "id": "w-" + week_key(TODAY), "generatedAt": TODAY.isoformat() + "T08:35:00.000Z", "example": True, "items": [{"text": "Entries that mention sleep average a full point below the rest; the earplugs week is the exception.", "evidence": "themeMood: sleep", "confidence": "moderate"}, {"text": "Running days are the best-rated days, but they are also the days with the most other activity, so the direction of cause is open.", "evidence": "themeMood: running", "confidence": "suggestive"}, {"text": "The Sunday dip is consistent across six Sundays; it is a weekly rhythm, not an event.", "evidence": "weekday profile", "confidence": "moderate"}]}]
settings = {"id": "main", "instructions": "Call the robotics work “the demo” or “the second arm”. Be direct in reviews.", "filingTier": "default", "weekStart": 1, "headsupAuto": False}
payload = {"app": "second-brain", "version": 2, "exportedAt": TODAY.isoformat() + "T09:00:00.000Z", "entries": entries, "trash": [], "goals": goals, "threads": threads, "digests": digests, "insights": insights, "headsup": headsup, "settings": settings}
OUT.parent.mkdir(exist_ok=True); OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False))
print(f"wrote {OUT}: {len(entries)} entries, {len(goals)} goals, {len(threads)} threads, {len(digests)} reviews")
