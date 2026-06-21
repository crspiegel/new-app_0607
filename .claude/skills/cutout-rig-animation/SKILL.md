---
name: cutout-rig-animation
description: Add gentle e-book/InDesign-style "cutout rig" motion to a flat character illustration — body parts (arm wave, head sway) oscillate around their joints with CSS. Use when the user wants a static character image to come alive with subtle part-based movement.
---

# Cutout rig animation (part-based character motion)

Turn a flat illustration into a lightly animated character by stacking separated
part layers and rotating each around its joint. This is the technique proven on
the home hero (`#homeScreen .hero-rig`, `assets/hero-rig-*.png`) — copy that.

## When to use
The user wants a character/illustration to gently move (wave a hand, sway head,
float) — not flashy, like an animated e-book.

## CRITICAL: required assets (ask the user for these)
A single flat PNG **cannot** be cleanly part-animated by code. Require **layered
transparent PNGs, all on the SAME canvas size**:

1. **base** — everything that does NOT move, AND the connection areas **extended**
   behind each moving part. ⭐ This is the key: where an arm/head attaches, draw
   the body a bit further (under where the part sweeps). Otherwise, when the part
   rotates, the gap shows the page background.
2. **one PNG per moving part** (e.g. `f-arm`, `d-arm`, `f-head`, `d-head`), each
   positioned correctly on the full canvas, transparent elsewhere.

If the user only has a flat image: ask them to separate it in Photoshop and
**export each layer at full document size (Export > Layers to Files, "Trim" OFF)**.
Do NOT try to auto-cut a flat raster — rectangular crops drag in neighbouring
parts (helmet moves with arm, half-faces), and averaging-inpaint pulls the black
outline in and makes a dark box. (Both were dead ends here.)

## HTML structure
```html
<div class="hero-rig">
  <img class="hero-image" src="assets/<base>.png" alt="..." />
  <img class="hero-rig-part hero-rig-<part>" src="assets/<part>.png" alt="" aria-hidden="true" />
  <!-- one <img> per moving part -->
</div>
```

## CSS pattern
- `.hero-rig` is the sized/positioned element and carries the whole-figure float +
  responsive width (move the original `<img>`'s width/margin/transform/animation
  rules onto `.hero-rig`; the base `<img>` becomes `width:100%;height:auto`).
- Each part overlays the base exactly and rotates around its joint:
```css
.hero-rig { position: relative; display: inline-block; /* + width/margin/float */ }
.hero-rig .hero-image { display:block; width:100%; height:auto; }
.hero-rig-part { position:absolute; top:0; left:0; width:100%; height:auto; pointer-events:none; }

.hero-rig-<part> {
  transform-origin: <Jx>% <Jy>%;          /* joint, as % of the artwork */
  animation: <name> <dur>s ease-in-out infinite;
}
@keyframes <name> { 0%,100%{transform:rotate(-Adeg)} 50%{transform:rotate(Adeg)} }
```
- **transform-origin %** = `jointX_px / canvasW * 100`, `jointY_px / canvasH * 100`.
  Joint = shoulder for arms, neck for heads.
- Typical values: arm wave ±6–9°, head sway ±3°. **Use different durations per part**
  (e.g. 1.7 / 2.0 / 2.3 / 3.1 s) so they don't move in lockstep — looks organic.
- One `filter: drop-shadow(...)` on `.hero-rig` (not on parts) → single shadow.

## reduced-motion
Default `@media (prefers-reduced-motion: reduce)` would freeze it. Ask the user:
many of them keep "reduce motion" ON system-wide but still want the hero to move.
If they want it always on, **exempt these selectors** from the reduce-motion block
(do NOT set `animation:none` on `.hero-rig`/`.hero-rig-part`). If you DO disable
under reduce-motion, the parts at rest = original image (fine).

## Find joints + verify (Python PIL + Playwright)
Use `scripts/rig-helper.py` in this skill folder:
- overlay a coordinate grid to read joint pixels,
- composite all layers to confirm reconstruction == original,
- render rotated extreme frames to check for gaps/seams BEFORE wiring CSS.
Then verify live: Playwright, freeze each part with inline `style.transform =
'rotate(±Adeg)'` (and freeze the rig float) and screenshot the extremes.

## Gotchas learned
- Base MUST have the body extended behind moving parts, or rotation reveals the bg.
- Never averaging-inpaint near outlines → dark box. Prefer real extended art.
- Element screenshots fail ("not stable") while animating — freeze animations or
  use full-page `page.screenshot`.
- Same-filename asset edits need a hard refresh (browser caches by name).
