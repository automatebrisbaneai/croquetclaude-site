# Quadrant — Design Notes

## Reference

Wade's hand-drawn original on paper (`claudes screenshot.png`). The reference is not Linear, Figma, or any award-winning SaaS aesthetic — it is a marker on a sheet of paper, with crooked axes, scratchy arrows, and the word "swap" hand-written above each row. The previous version replaced this honest analog with tasteful gradients and three switchable themes; all three felt like a SaaS template. Generic centrist software is exactly what we are escaping.

The aesthetic anchor is **architectural drafting paper**: cream stock, deliberate hand-drawn ink, dymo-tape labels, sticky notes. It belongs on a meeting room table among real volunteers in their 60s who will type into their phones. Refined enough that the typography feels considered; raw enough that the lines look like they were drawn at 9pm with a Pilot G-2.

## Design choices

**Palette.** Cream paper (#f4eedb) over a warm tinted base, with quadrants washed in four hand-mixed inks: ochre + sap green + slate blue + sienna. Quadrants are visibly colour-coded but not loud — they read as ink wash rather than CSS gradient. Borders are 2-3px hand-drawn-feeling strokes with a subtle SVG roughen filter, not the perfect 1px hairlines of the previous version. Pure black is replaced with a warm carbon (#1a1612).

**Typography.** Display headings use **Bricolage Grotesque** (variable, italic for "swap" labels) — a contemporary face with personality, not Inter. Section labels use **Caveat** for the hand-drawn axis annotations and the playful "swap" arrow inscription, mirroring Wade's original handwriting. Body and cards use **Source Serif 4** at 15-16px — a serif feels more like notebook text than another sans on the pile. Tabular numerals for counts.

**Layout.** Same 4-quadrant grid + unsorted tray, but the axes are drawn as actual SVG ink lines with rough-edge filters, with stroked arrowheads and Caveat-handwritten "swap" labels that span the rows — directly quoting Wade's drawing. The single brand wordmark is left-aligned with a small wax-seal-style status pill. The three-theme switcher is removed entirely; one direction, fully committed.

**Cards as sticky notes.** Each card is a slightly-rotated paper rectangle with a soft shadow, a torn-tape detail at the top, and rotation that varies by id (-1° to 1.4°) so a stack of them looks like real sticky notes scattered in a quadrant. Hover lifts the card 2px and squares the rotation; drag tilts it further.

**Motion rationale.** The flicker bug is fixed with a `.is-new` class strategy — only freshly-created cards (via PocketBase create event or local add) animate in. Realtime updates and quadrant moves do NOT replay the entrance animation. Drag-end moves are a CSS transform transition, not a re-render. Custom curves throughout (`cubic-bezier(0.22, 1, 0.36, 1)` for entry, `cubic-bezier(0.34, 1.56, 0.64, 1)` for the lift), no default easings.

**What this design does NOT have.** No glassmorphism. No purple-blue gradients. No theme switcher. No tasteful neutral-grey-on-white. No "ease 0.3s" defaults. No identical card grid (sticky-note rotation breaks the grid intentionally). No Inter at 15px.

**The one thing someone will remember:** the hand-drawn "swap" inscription with its scratchy curved arrow stretching across each row, lifted directly from Wade's marker drawing — paired with sticky-note cards that look like the meeting actually happened on paper.
