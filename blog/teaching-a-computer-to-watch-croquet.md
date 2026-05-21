# Teaching a Computer to Watch a Game of Croquet

*May 2026*

The single best predictor of who wins a Golf Croquet game isn't shot selection or tactics. It's execution. In 49 of 50 elite games Dr Jenny Clarke analysed, the player with the higher per-stroke success rate won. A 2% difference is enough.

The framework that gives you that number is called **Cowing Performance Analysis**. It's one of the sharpest coaching diagnostics croquet has, and almost nobody gets one. Doing it by hand takes hours per game.

I've been building a system to do it from video instead. Here's what works, what doesn't, and where the croquet community comes in.

---

## What Cowing Performance Analysis is

If you've coached at the higher levels of Golf Croquet, you may have come across CPA already. Andrew Cowing devised it. Dr Jenny Clarke refined it and wrote it up for *Croquet World* in 2020. Marty Clarke has been running coaching sessions on it around Australia ever since.

Every stroke a player plays goes into one bucket:

- **Positioning**: moving your ball to a spot you've chosen
- **Clearing**: hitting an opponent's ball away (short range vs. long range)
- **Hooping**: attempting to run a hoop (short vs. long approach)
- **Joker**: jaws, un-jaws, blocking, in-off, jump shots

For each stroke you also record whether it succeeded for the striker. Add up the row, divide by the total, and you get a single percentage: the player's success score for the game.

Reg Bamford at his peak British Open form scored 80–82%. Tournament-winning play sits at 75%-plus. Below 55% and the opponent is significantly stronger.

The diagnostic tells a player exactly where they're leaking points: which category they're under-performing in, against an elite benchmark.

---

## Why this stays rare

A 13-hoop game has 80 to 150 strokes. A trained analyst watches the game, classifies every stroke, judges success or fail, and tallies a spreadsheet. Two players per game means two analysts, or one analyst doing two passes. Forty minutes of play turns into two hours of post-match work.

Multiply that by every player in a club, every match, every week, and the cost becomes prohibitive. This stays a thing top coaches do for elite players at marquee tournaments, not a thing every weekend club player gets after every match.

Automate it, even imperfectly, and the cost-per-game drops to cents. Every game gets one.

---

## How the pipeline works

**1. Hear the strokes.** A mallet on a ball is a sharp, broadband sound. Distinct from talking, footsteps, or wind. A peak detector on the high-passed audio track produces a list of stroke timestamps. A tournament Open Final lands around 175 strokes, which is the right ballpark.

**2. Watch the court.** The system needs to know where each of the four balls is, sample by sample, throughout the game. For now it uses colour segmentation. Croquet balls are saturated colours on uniform green grass, which is a problem computer vision was made for. Add roundness and size filters and you have a working primitive. On fixed-camera elevated footage like the Australian Open broadcast, this works reliably. On handheld panning footage the same primitive struggles, because the camera moves faster than the maths.

**3. Write it down properly.** No chess-PGN-equivalent exists for croquet. No agreed format for recording move-by-move what happened in a game. I've drafted one: **Croquet Algebraic Notation (CAN)**. Each line records the striker, the ball, where it started on the court, where it ended, and what happened along the way. Like this:

```
1.  U(2.0,17.5)>(7.5,28.4)  Ru:1     ; Blue runs hoop 1
2.  R(2.0,17.5)>(13.5,11.1)  Ru:1.fail   ; Red attempts hoop 1, hit wires, bounced back
3.  K(26.0,17.5)>(14.2,9.8)  Cl:Y(13.5,11.1)>(20.4,4.1)   ; Black clears Yellow
```

A croquet player who reads that for thirty seconds can follow the game in their head. A computer reads it natively. Same artifact, two audiences.

Strictly Golf Croquet at v0.1. Association Croquet gets its own specification when someone has the time to write it. Too many concepts (peels, croquet strokes, leaves, baulks) have no GC equivalent, so folding them into one document gets messy.

**4. Ask the crowd when unsure.** The auto-classifier is good at the easy strokes: a clear positioning shot, an obvious clearance. It struggles on the moments that matter most. A hoop attempt that just barely succeeds or just barely fails. A tactical joker shot. A stroke where the camera moved at the wrong second. For those, the system flags the stroke as low-confidence and asks a human.

You can see the shape of it below.

That's a real stroke from the 2025 Queensland Open Final. The auto-classifier called it positioning. The scoreboard ticked over six seconds later. Addison ran a hoop. When humans see the clip and answer "what kind of shot is this?", they call it correctly 84% of the time. The system learns from that disagreement: my auto-classifier was wrong here, the human was right, and the labelled answer goes into the training set for next time.

Three things happen at once when a human answers:

1. The stroke gets a verified label. The system gets honest.
2. The human who answered wrong sees a one-sentence explanation of what the right read was. Coaching, at the resolution of a single stroke, at scale.
3. The labelled answer accumulates into a training set. Once there are enough labels, a small purpose-built model trained on the human-labelled set will outperform any generic vision model, and run at near-zero cost per stroke.

---

## Where it's up to

- Audio stroke detection works. Around 175 strokes detected on a 40-minute tournament game.
- Court masking and colour-based ball detection work on fixed-camera elevated footage. Three of four balls correctly located in clean frames.
- Per-stroke classification by generic AI alone hit a wall at the "hooping" category. The ball-passing-through-wires event is too small and too fast for current general-purpose vision models to catch reliably. That's why the crowd loop matters.
- The CAN notation draft is at v0.1, ready for community review.
- The classify-and-learn page is mocked up and works end-to-end as a demo. Feeding it real low-confidence questions from a real game is the next build.

---

## Where the community comes in

Two open questions, both for people rather than AI.

One is the notation. CAN is currently a draft. Whether it becomes a useful standard depends on coaches and analysts having a look, telling me where it's wrong, where it's missing something, and where abbreviations should follow long-established usage rather than what I came up with. That review will happen in public once the spec is ready for it.

The other is the classifier. A few minutes a week answering "what kind of shot is this?" produces two things at once: training data for the system, and a small coaching reflection for the person who answered. Wrong answers come with a short explanation. Right answers go into the dataset.

I'll share a link to the live classifier when there's something real to try.

---

*Cowing Performance Analysis is the work of Andrew Cowing (original framework), Dr Jenny Clarke (the 2020 Croquet World article that defined it for the modern community), and Marty Clarke (who's been running the coaching sessions that put CPA in front of real club players around Australia). This project automates their framework. It does not reinvent it.*
