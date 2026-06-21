---
name: word-reveal-animation
description: Reveal a heading/text word-by-word with a staggered entrance (each word pops up in sequence on load). Use when the user wants a title or line of text to animate in word by word.
---

# Word-by-word reveal animation

Make a heading appear one word at a time with a small "pop up" overshoot. Proven
on the home hero title (`#homeTitle .hero-word`) — copy that.

## When to use
The user wants a title/line to animate in word-by-word (a one-time entrance).

## HTML — wrap each word in a span
```html
<h1 id="someTitle">
  <span class="reveal-word">Word1</span>
  <span class="reveal-word">Word2</span>
  <span class="reveal-word">Word3</span>
</h1>
```
Whitespace between the spans renders as the normal space (inline-block). Keep the
element's own block entrance OFF so words animate individually (`animation:none`).

## CSS
```css
#someTitle { animation: none; }            /* let words animate, not the block */

.reveal-word {
  display: inline-block;
  opacity: 0;
  animation: wordReveal 600ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
}
.reveal-word:nth-child(1) { animation-delay: 0.05s; }
.reveal-word:nth-child(2) { animation-delay: 0.22s; }
.reveal-word:nth-child(3) { animation-delay: 0.39s; }
.reveal-word:nth-child(4) { animation-delay: 0.56s; }   /* +~0.17s per word */

@keyframes wordReveal {
  0%   { opacity: 0; transform: translate3d(0, 26px, 0); }
  60%  { opacity: 1; transform: translate3d(0, -6px, 0); }  /* slight overshoot = "pop" */
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
```
- Stagger ≈ 0.17s; per-word duration ≈ 0.6s. Tune both for faster/slower.
- For many words, generate the spans (and delays) instead of hand-numbering, or use
  `animation-delay: calc(var(--i) * 0.12s)` with `style="--i:N"` per span.

## reduced-motion ⚠️ (the gotcha that hides text)
`.reveal-word` defaults to `opacity:0`. If you disable its animation under
`@media (prefers-reduced-motion: reduce)` WITHOUT forcing `opacity:1`, the words
become permanently invisible.

Two valid choices — ask the user (some keep "reduce motion" ON but still want it):
- **Always play (exempt):** leave `.reveal-word` out of the reduce-motion block.
- **Respect reduce-motion:** in the block add `.reveal-word{ animation:none; opacity:1 }`
  so words show instantly.

## Notes
- Entrance plays once on page load. It does NOT replay when an SPA just toggles
  the screen's `display` (no re-mount). If a replay-on-revisit is needed, re-trigger
  via JS (remove/re-add the class or restart the animation).
- Verify with Playwright: load with `waitUntil:'commit'`, screenshot at ~300ms to
  catch the stagger; check final `opacity` is 1 for all words.
