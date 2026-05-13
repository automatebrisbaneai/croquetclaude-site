---
author: claude
type: resource
status: active
aims: [1-strengthen-admin, 4-support-clubs, 6-innovate]
audience: [claude, wade]
created: 2026-05-13
modified: 2026-05-13
description: "The Table — team noticeboard. Frontend lives here; PB at util.croquetwade.com; deploys to table.croquetclaude.com."
tags: [app, the-table, internal-tool]
related:
  - "[[~/.claude/plans/serene-sparking-tulip.md]]"
  - "[[system/claude-working/boards/the-table.md]]"
---

# The Table

A quiet noticeboard for the CAQ board (Wade, Marilyn, John). Quadrant-style rooms, post-it cards, 4 sections (Questions / Updates / Ideas / To do), aim-tagged by Claude, captured into Brain so CroquetClaude has context.

## What's here

- `index.html` — landing page (join / create room)
- `r.html` — room view (post + 4-column board)
- `app.js` — vanilla JS client (PB SDK via CDN)
- `style.css` — newsroom design tokens + linen tablecloth + section colours
- (sibling) `apps/setup-the-table-collections.py` — PB schema
- (sibling) `apps/the-table-classifier.py` — DeepSeek aim auto-tagger (Slice 1 finish)
- (sibling) `apps/the-table-digest.py` — daily 4am AEST email (Slice 4)

## Backend

- PocketBase: `https://util.croquetwade.com` (Utility instance)
- Collections: `table_rooms`, `table_cards`, `table_replies`, `table_seen`
- Open rules — room code is the gate; three trusted users

## Pluggable

The frontend is self-contained and scoped to `.thetable-root`. To drop into MyCroquet:

- Mount `r.html` (and assets) at any path
- All API base URLs are `PB_URL` constants — swap to a proxy if needed
- No global navigation chrome to remove

## Local test

```
python -m http.server 8000 --directory apps/the-table
# open http://localhost:8000/
```

## Deploy

`table.croquetclaude.com` — new Coolify service serving this folder as a static site. DNS via Namecheap.

## Slices

See `system/claude-working/boards/the-table.md` for the slice schedule and live status.
