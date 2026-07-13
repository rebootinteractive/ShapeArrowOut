# Shape Arrow Out — approved design (2026-07-13)

Inspired by Bus Traffic Fever! (GOODROID): keeps the unblock yard and the limited
buffer (deck), replaces buses/passengers with arrow containers feeding nested
shape outlines made of colored dot segments.

## Screen (portrait, phone)

1. **Shape (top) — demand.** Nested outline loops (circle / hexagon / star / square /
   triangle) divided into colored segments made of dots. Segments ride their outline
   like a conveyor. All loops are lap-synced: position measured as percent of the
   loop, all loops advance at the same percent-per-second, so nested segments stay
   aligned forever on any shape.
2. **Deck (middle) — buffer.** Fixed slot count. Parked containers auto-fire arrows
   (rapid, hands-off) at exposed matching dots. Empty container vanishes, frees slot.
3. **Yard (bottom) — supply.** Square grid of colored arrow containers, each stamped
   with a cardinal direction and holding up to the level's arrows-per-container.
   Tap: if the path to the grid edge along its arrow is clear it slides out and
   parks in a free deck slot; otherwise it bumps.

## Exposure rule (when a dot can receive an arrow)

- **Window rule:** dot is inside the fixed 90° arc at the bottom of the shape.
- **Clear-ray rule:** no surviving outer segment covers the same loop-fraction.
- Completed segments are destroyed, permanently exposing what's behind (onion peel).

## Win / lose

- Win: every segment destroyed.
- Lose (hard detection): nothing in flight, no parked container can ever fire again
  (no surviving matching dot with a clear outer ray), and either the deck is full or
  no yard container can exit.

## Editor (two stages)

1. **Demand:** outline preset, loop count, segments per loop, colors, conveyor lap
   time, deck slots, arrows per container, dot mode — fixed (dots per segment) or
   proportional (density × segment length, with minimum).
2. **Supply:** auto-distributes containers into the yard via reverse construction
   (insert in reverse dispatch order, exit ray must be clear of already-inserted
   pieces) → tapping in dispatch order is a valid solution. Then manual editing with
   live balance + extractability warnings. Test / Copy JSON / Download / Save.

## v1 scope

Full loop, 3 built-in levels (trivial → moderate → tricky), 2-stage editor with the
five outline presets, GitHub Pages deploy. Not in v1: freeform/artsy outlines,
audio, meta-progression.
