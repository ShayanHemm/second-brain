# Architecture

## Processes

One Python process (`sb serve`, or the same thing started inside `sb app`) does everything: it serves the page, exposes a JSON API over the vault, streams change events, relays calls to Claude, and runs the backup loop. There is no database server and no build step at runtime: the page is assembled once by `ui/build.py` and read from disk on each request, with the installation token and a small info block injected.

## The vault

```
~/SecondBrain/
  entries/YYYY/YYYY-MM-DD-<id>.md   one file per entry: YAML front matter = the card, body = the text
  threads/<id>.md                   thinking threads: front matter = data, body = readable transcript
  reviews/w-YYYY-Www.md, m-YYYY-MM.md
  headsup/YYYY-MM-DD.md             daily interpretations
  goals/<id>.json  insights/<key>.json  settings.json
  assets/<id>.<ext>                 attached images
  trash/<collection>/...            files removed with "Delete forever"
  backups/sb-YYYYMMDD-HHMMSS.zip
  .index.sqlite                     rebuildable: docs table + FTS5 over entries
  .usage.jsonl                      one line per Claude call: model, purpose, tokens, cost
```

Writes are atomic (temp file + rename). The index row is updated in the same lock-protected section. If the index is deleted or corrupted, `sb reindex` rebuilds it from the files; the service also rebuilds it on start when it is empty.

## The entry card

```yaml
id: e_...            createdAt / updatedAt (ISO)   ts (epoch ms)   date (local YYYY-MM-DD)   time (HH:MM)
type: journal | idea | task | goal | question | feeling | decision | note
title, summary
mood:   {ai: -2..2 | null, user: -2..2 | null, evidence: "quote"}
energy: {ai: 1..5 | null,  user: 1..5 | null,  evidence: "quote"}
themes: [lowercase strings]     themeEvidence: {theme: "quote"}     domains: [from a fixed list of 14]
people: [...]  projects: [...]  goals: [goal ids]
tasks: [{id, text, done, doneAt}]   questions: [{id, text, resolved}]
links: [{to: entry id, reason, status: proposed | accepted | rejected}]
followup: "one question" | null     attachments: [{id, type}]
filing: pending | done | failed | manual     typeLocked, edited, deleted, deletedAt
```

The body of the Markdown file is the entry text; everything else is the header.

## API (all under `/api`, all requiring the `X-SB-Token` header)

| Route | Purpose |
|---|---|
| `GET /{coll}`, `GET /{coll}/{id}`, `PUT /{coll}/{id}`, `DELETE /{coll}/{id}` | documents in `entries`, `goals`, `threads`, `digests`, `insights`, `headsup`, `settings` |
| `GET /events` | server-sent events: `{collection, id, op}` on every write |
| `POST /ai/complete` | `{input, tier, json, purpose}` → `{text}` or `{value}`; errors as `{error: {code, message}}` |
| `POST /ai/test`, `POST /config` | key test; key, models and backup settings |
| `POST /assets`, `GET /assets/{name}` | image upload and serving |
| `POST /backup`, `POST /reindex`, `POST /open-vault`, `POST /import`, `GET /export.json`, `GET /info` | maintenance |

The page talks to this API through `ui/src/25_local_bridge.js`, which presents the same small interface the hosted (claude.ai artifact) version of the page uses: `db.collection(...).onSnapshot`, `doc.set`, `sample(prompt)`, `downloads.save`, `assets.upload`, `user.id`. Swapping the bridge is all it takes to run the interface against a different backend; the static demo runs it against nothing at all.

## Claude layer

`sb/ai.py` builds `messages` from the page's prompt (a string, or a list of turns for the thinking partner), picks the model from the tier and purpose, sets `output_config.effort` per purpose (filing low, links medium, reviews and heads-up high, thinking medium), requests up to 16k output tokens, and parses JSON tolerantly when asked (whole text, then a fenced block, then the outermost braces). Opus calls go through the beta endpoint with the server-side refusal fallback and fall back to the plain endpoint if the account does not take it. SDK exceptions are mapped to the interface's error codes (`session_expired`, `rate_limited`, `prompt_too_large`, `refused`, `invalid_json`, …).

## Statistics in the page

All computed client-side from the cards (`ui/src/60_patterns.js`): day means of mood and energy with 7-day rolling means, weekday profile, entries per week, theme share this 30 days against the previous 30, theme against mood (n ≥ 3), co-occurring theme pairs, open loops (questions ≥ 14 days, tasks ≥ 7, goals without activity ≥ 14, threads open ≥ 7), themes on the day before low days, time-of-day profiles, the mood-against-energy quadrants, streaks. Confidence tags follow n: suggestive below 8, moderate below 20, strong beyond.

## Clustering (`ui/src/55_network.js`)

1. Concept graph: one node per theme, person, project or goal; an edge for every pair that shares an entry, weighted by the count.
2. Backdrop: with six or more entries, a theme present in more than half of them is removed from the clustering and drawn separately.
3. Weights normalised Jaccard-style: shared / (n_a + n_b − shared).
4. Louvain: local moving and aggregation, repeated until no gain; resolution swept over 1.0, 1.4, 1.9, 2.5 until no community holds more than 60% of the nodes or there are at least three.
5. Each entry inherits the majority community of its concepts; a custom force pulls members toward their community centroid and pushes centroids apart; hulls are Catmull-Rom closed curves around padded member points.

## Security notes

Loopback binding only. The token is generated once per installation (`~/.config/second-brain/token`, mode 600) and injected into the page; a request without it is refused, so other local pages cannot read or write the vault through the browser. The API key is stored next to the token, never in the vault, and never sent anywhere but to the Anthropic API.
