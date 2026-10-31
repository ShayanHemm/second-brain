# Design notes

Decisions, in the order they were made, with what went wrong along the way.

## Why a journal, and why a brain

The starting idea was the analogy to a long calculation: you cannot hold it in your head, you write the steps down. Journaling does the same for feelings, decisions and goals. A plain journal, though, is write-only; nobody re-reads a year of entries. So the brain had to do three things a notebook cannot: file each entry into a structure, connect entries to each other, and notice what repeats.

## Hosted first, local second

The first version was a hosted page with a built-in store and built-in Claude access: zero setup, works on a phone. It was rebuilt local-first for one reason: durability. A single store is a single point of failure, and a journal is meant to outlive any product. Plain Markdown files, zip snapshots, a trash folder instead of deletion, merge-safe imports and an index that can always be rebuilt are the whole durability story. The hosted page remains useful as a phone inbox; its export imports here.

## Filing: from "reuse these labels" to evidence

The first filing prompt handed the model the list of themes already in the brain with the words "reuse these labels when they fit". The second entry ever written, about unemployment, came back tagged only *procrastination*, the single label that existed at the time. A later version coined the catch-all *life-impact* and then attached it to a marriage ending and to an immigration worry, so the network showed one blob.

Three changes fixed it. The vocabulary is now described as a spelling aid, explicitly not a menu. Catch-all labels are forbidden in the prompt and dropped in code. And every theme and every estimate must be backed by a quote from the entry; the page checks each quote against the text and rejects what it cannot find. A fixed list of fourteen life domains gives the cards a stable backbone that does not depend on the model's wording, and a second pass runs when an entry of eight words or more ends up with fewer than two themes.

The general lesson: a language model will optimise for the hint you give it. Ask for consistency and you get collapse. Ask for evidence and you get specificity, plus something a human can check in two seconds.

## Clustering: label propagation collapses

Label propagation over the co-occurrence graph produced one giant community as soon as a hub theme existed, which in a journal is immediate. Jaccard-normalised weights helped a little; a self-preference term helped a little more; neither was enough. Louvain modularity with a resolution sweep separates topics cleanly in tests with a synthetic forty-entry journal built around one hub theme, and the backdrop rule removes the hub from the computation altogether while keeping it visible.

## Statistics: say the n

A journal is one person, a few entries a day at best. Every pattern statement carries its sample size and a confidence word derived from it, the mood-against-energy quadrant is shown as counts rather than conclusions, and the trend projection is labelled weak evidence. Claude's narration is asked to question at least one tempting but weak conclusion each time.

## Mood and energy are two axes

Mood is pleasantness; energy is activation. Low mood with high energy is agitation and wants discharge; low mood with low energy is depletion and wants rest. A single "how do you feel" number blurs the two, and the remedies differ, so the app tracks both and the quadrant shows the split.

## Things that broke and what they taught

- Elements with the `hidden` attribute still showed because a CSS rule set `display` on them. A one-line reset fixed it; the lesson is to test empty states, not only full ones.
- A per-run access token silently invalidated every open window when the service restarted. The token is now per installation, and a page that meets a stale token reloads itself and keeps its draft.
- One SQLite connection shared across request threads failed at random under load, so some windows kept stale data. All index access now goes through a lock, and a failed refresh retries.
- The network's canvas reported a zero size while its tab was hidden, so the layout drifted and the auto-zoom aimed at an empty region. It now measures itself when shown and re-fits whenever the graph changes unless the user has zoomed.

## What is next

Reading images (photographed handwritten pages, whiteboards), a properly signed app shell, phone capture that syncs into the vault, and semantic links from embeddings rather than only from shared labels.
