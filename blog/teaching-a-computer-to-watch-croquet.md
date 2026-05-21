# Teaching a Computer to Watch a Game of Croquet

*May 2026*

The single best predictor of who wins a Golf Croquet game isn't shot choice or tactics. It's execution. In a study of 50 elite games, the player who hit more of their shots cleanly won 49 of them. A 2% gap was enough. Tactics matter, but execution decides.

The framework that gives you a player's execution number is called **Cowing Performance Analysis**. It's one of the sharpest coaching diagnostics croquet has, and almost nobody gets one. Doing it by hand takes hours per game.

I've been building a system to do it from video instead. Here's what works, what doesn't, and where the croquet community comes in.

---

## What Cowing Performance Analysis is

You may have come across CPA in coaching circles. It's a way of scoring how well a player executes the shots they play. Andrew Cowing came up with the framework. Dr Jenny Clarke, the New Zealand world-ranked Golf Croquet player, refined it and wrote it up for *Croquet World* magazine in 2020. Marty Clarke (Australia's GC High Performance Manager) has been running coaching sessions on it around Australia ever since.

Here's how it works. Every shot a player plays goes into one of four buckets, based on what they were trying to do:

- **Positioning**: moving your ball to a chosen spot on the lawn.
- **Clearing**: hitting an opponent's ball away. Split into short range (under 7 yards) and long range (7 yards or more), because a clearance from close in is easier than one across the lawn.
- **Hooping**: attempting to run a hoop. Also split short vs long, by how far the striker is from the hoop.
- **Joker**: the situational shots that don't fit the other categories. Jawsing your own ball (parking it in the hoop's jaws to block), un-jawsing an opponent's, defensive blocking, in-offs, jump shots.

Then for each shot you ask one more question: did it work? If they were trying to position, did the ball end up where they wanted? If they were clearing, did the opponent's ball get cleared? Add up the row, divide by the total shots played, and you get the player's success rate for the game.

Reg Bamford at his peak British Open form scored 80–82%. Tournament-winning play sits above 75%. Below 55% and the opponent is significantly stronger. Crucially, it tells a player exactly where they're leaking points. Are they missing short clearances? Are they over-attempting long hoops? The percentage breakdown by category points straight at the weakness.

---

## Why this stays rare

A 13-hoop game has 80 to 150 strokes. A trained analyst watches the game, classifies every stroke, judges success or fail, and tallies a spreadsheet. Two players per game means two analysts, or one analyst doing two passes. Forty minutes of play turns into two hours of post-match work.

Multiply that by every player in a club, every match, every week, and the cost becomes prohibitive. This stays a thing top coaches do for elite players at marquee tournaments, not a thing every weekend club player gets after every match.

Automate it, even imperfectly, and the cost-per-game drops to cents. Every game gets one.

---

## How the system works

Four steps.

**1. Listen for the shots.** A mallet hitting a ball makes a sharp, distinctive sound. Different from talking, footsteps, or wind. The software listens to the audio and notes every time it hears that sound. On a 40-minute tournament game it finds around 175 shots, which is the right ballpark. That's the first thing the system knows: when each shot happens.

**2. Find the balls.** The harder part. For every moment in the game, the software needs to know where each of the four balls is on the lawn. It does this by colour. Croquet balls are bright red, yellow, blue, and black, and the lawn is uniformly green. Recognising bright dots against a flat background is a task computers are genuinely good at. Combine that with shape (the dots should be round) and size (small but consistent), and you have a working ball-finder.

This works well when the camera doesn't move. A clubhouse balcony angle, or a fixed pole-mounted camera, is the easy case. On handheld footage where the camera follows the action, the same approach struggles, because the lawn keeps shifting in the frame.

**3. Write down what happened.** Chess has a standard way of recording games: '1. e4 e5 2. Nf3 Nc6'. You can read a chess game from a notation file without ever seeing the board. Croquet doesn't have an equivalent. So I drafted one. It's called **Croquet Algebraic Notation**, or CAN. A few lines look like this:

```
1.  U(2.0,17.5)>(7.5,28.4)  Ru:1
2.  R(2.0,17.5)>(13.5,11.1)  Ru:1.fail
3.  K(26.0,17.5)>(14.2,9.8)  Cl:Y(13.5,11.1)>(20.4,4.1)
```

Reading it out:

- **Line 1:** Blue (U) struck a ball from court position (2.0, 17.5) to (7.5, 28.4). Coordinates are in yards from the north-west corner of the lawn. `Ru:1` means the ball ran hoop 1.
- **Line 2:** Red (R) struck from the same starting spot, ended at (13.5, 11.1). `Ru:1.fail` means an attempt at hoop 1 that didn't go through, probably hit the wires and bounced.
- **Line 3:** Black (K) struck from (26.0, 17.5), ended at (14.2, 9.8), and along the way contacted Yellow (Y), `Cl:Y` for clearance, moving Yellow from (13.5, 11.1) to (20.4, 4.1).

A croquet player who reads that for half a minute can replay the game in their head. The software reads it directly. Same file, two audiences.

This first version covers Golf Croquet only. Association Croquet has its own concepts (peels, croquet strokes, leaves, baulks) that don't translate, so it'll get a separate document when someone has time to write one.

**4. Ask a human when the geometry isn't enough.** This is the new part. From the ball positions before and after a shot, most categories drop out cleanly. The ball passed through a hoop's coordinates: hoop run. It contacted an opponent ball that then moved: clearance. It just travelled to a chosen spot: positioning. Easy answers in the easy cases.

The hard cases are where the geometry is uncertain. A player walks through the frame and we lose the ball for a second. Two shots happen close together and the scoreboard says a hoop ran but we can't tell which one ran it. A ball clipped a hoop wire and bounced back to almost the same spot, so was it a failed hoop attempt or just a small position adjustment? For those, the software flags the shot and asks a person.

You can see the shape of it below.

That's a real shot from the 2025 Queensland Open Final. Working from the ball positions alone, the software called this positioning: the ball moved to a spot, no clear hoop-wire crossing in the tracked trajectory. But the scoreboard ticked over six seconds later, so we know someone ran a hoop within a few seconds of this clip. Either this shot did run it and the tracking missed the wire-crossing, or the next player ran on their turn. The software can't tell which. That's exactly when it asks a person. Multiple human answers, combined with the scoreboard timing, eventually settle it. The agreed answer goes into a learning set, and the software gets better at the next shot like this one.

[Try the classify-and-learn preview.](/classify/) Four clips from this game, four questions, see what other people called each one and why.

Three things happen at once when a person answers:

1. The shot gets a verified label. The software gets an honest read on what actually happened.
2. The person who answered wrong sees a short explanation of what the right read was. It's coaching, one shot at a time, available to anyone.
3. The answer accumulates into a learning set. Over time, with enough answers, the software learns to handle the same kind of shot on its own. Eventually it stops needing off-the-shelf AI to power it: we'd train a small dedicated model from the human answers, which would be cheaper to run and more accurate for croquet specifically.

---

## Where it's up to

- **Hearing the shots: works.** Around 175 shots detected on a 40-minute tournament game.
- **Finding the balls: works on fixed-camera footage.** Three of four balls reliably located in clean frames. Handheld footage is still the hard case.
- **Classifying the kind of shot from ball positions: works for most shots.** Once we know where each ball was before and after a shot, the category drops out geometrically. Did the ball pass through a hoop's coordinates? That's a hoop run. Did it contact an opponent ball and move it? That's a clearance. Did it just move to a chosen spot? That's positioning. No vision-AI needed for the shot type itself: the ball positions tell us.
- **The edge cases need human help.** When ball tracking is uncertain, when the camera moves at the wrong moment, when the question is whether THIS shot ran the hoop or the NEXT player did, the geometry alone isn't enough. The classify page is for those cases.
- **Notation:** CAN draft at version 0.1, ready for community review.
- **The classify-and-learn page:** built as a preview. The live version, hooked up to real low-confidence questions from real games, is the next thing to build.

---

## Where the community comes in

Two open questions, both for people rather than AI.

One is the notation. CAN is currently a draft. Whether it becomes a useful standard depends on coaches and analysts having a look. They tell me where it's wrong, where it's missing something, and where abbreviations should follow long-established usage rather than what I came up with. That review will happen in public once the spec is ready for it.

The other is the classifier. A few minutes a week answering "what kind of shot is this?" produces two things at once: training data for the software, and a small coaching reflection for the person who answered. Wrong answers come with a short explanation. Right answers go into the learning set.

The [preview is here now](/classify/). The live system will follow, once the pipeline can feed it real low-confidence questions from games it has just watched.

---

*Cowing Performance Analysis is the work of Andrew Cowing (original framework), Dr Jenny Clarke (the 2020 Croquet World article that defined it for the modern community), and Marty Clarke (who's been running the coaching sessions that put CPA in front of real club players around Australia). This project automates their framework. It does not reinvent it.*
