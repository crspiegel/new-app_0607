## Overview

This design system is based on the visual language of Duolingo ABC's "How We Teach" website, adapted for a kindergarten English learning web/app experience. The reference uses a playful literacy-product style: high-saturation blue and green brand colors, white content cards, chunky rounded typography, large educational illustrations, generous vertical rhythm, and simple sectional storytelling.

For this project, use Duolingo ABC only as a style reference for color, spacing, typography feel, image usage, button weight, and child-friendly clarity. Do **not** copy the site's angled or wavy section separators. Our app must use straight rectangular section boxes and clean horizontal transitions between sections.

**Key Characteristics:**

- Bright, friendly education palette anchored by blue, green, white, and soft gray
- Large character/book/activity illustrations used as primary visual anchors
- Chunky rounded display typography for headings and high-readability rounded sans text for UI
- White cards on saturated color sections, with simple grid layouts
- Tactile buttons with thick bottom "lip" shadows and rounded rectangular shapes
- Generous padding, centered content, and clear reading hierarchy
- Rectangular section bands only; no diagonal, slanted, wave, blob, or scalloped section dividers

---

## Implemented Design System (current build — source of truth)

> The sections **above and below** this block describe the original Duolingo-ABC
> _inspiration_. **This block reflects what is actually built** in
> `styles.css` / `app.js` and **supersedes the legacy reference wherever values
> differ** (fonts, radii, the per-level theme system). When in doubt, trust this
> section and the code.

### Global tokens (`:root`)

| Token              | Value                                                                                   | Notes                                     |
| ------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| `--radius-control` | `16px`                                                                                  | buttons / controls (legacy doc said 12px) |
| `--radius-card`    | `18px`                                                                                  | cards                                     |
| `--site-max-width` | `1600px`                                                                                | outer shell cap                           |
| `--content-width`  | `min(80%, 1600px)`                                                                      | centered content column                   |
| `--hero-height`    | `620px`                                                                                 | home hero                                 |
| `--ink`            | `#3c3c3c`                                                                               | primary text (legacy doc said `#4B4B4B`)  |
| Base palette       | owl-green / macaw-blue / sunny-yellow / alert-red / purple-accent (+ `-shadow` of each) | unchanged from reference                  |

### Fonts actually loaded

- **Display:** `Fredoka` → Nunito → Segoe UI (`--font-display`).
- **UI / body:** `Nunito` → Segoe UI → Noto Sans (`--font-ui`).
- **Nav / structural:** `Inter` (`--font-nav`).
- **Special-purpose:** `Sniglet` (level names / level-icon numbers), `Manrope 800`
  (month-select & content month numbers), `Concert One` (month-select fallback
  number rule), `Baloo 2` (content H2 — currently hidden).
- Global hard rule: **no italics anywhere** (`font-style: normal !important` +
  `font-synthesis: none` on `*`, `html`, `body`, `button`).

### Per-level theme system (the core of the current design)

Each level screen (`#monthScreen`, `#contentScreen`, V2, V3) gets a
`level-theme-N` class on the screen element; `app.js` also mirrors it onto
`<body>` so the footer can pick it up. All per-level color comes from these CSS
variables — components reference the tokens, never hard-coded level colors, so a
treatment built for one level rolls out to all four for free.

| Level  | `--level-accent` (base)  | `--level-accent-shadow` | `--level-accent-soft` (page tint) | `--content-day-bg` (weekday btn) | `--content-day-shadow` | `--content-day-text` (label) | `--content-week-tint` (week card) |
| ------ | ------------------------ | ----------------------- | --------------------------------- | -------------------------------- | ---------------------- | ---------------------------- | --------------------------------- |
| **L1** | `#ffc800` (sunny-yellow) | `#d49a00`               | `#fff3cc`                         | `#ffd43b`                        | `#c78f00`              | `#8a6400`                    | `#ffe9a8`                         |
| **L2** | `#ff4b4b` (alert-red)    | `#d83434`               | `#ffe8e8`                         | `#ff7676`                        | `#e85555`              | `#a83838`                    | `#ffcfcf`                         |
| **L3** | `#1cb0f6` (macaw-blue)   | `#1899d6`               | `#e8f6ff`                         | `#45c0f7`                        | `#2aa6e3`              | `#135f95`                    | `#c6e7ff`                         |
| **L4** | `#ce82ff` (purple)       | `#9f55d8`               | `#f4e3ff`                         | `#da99ff`                        | `#ad6ce0`              | `#71399f`                    | `#e6c9ff`                         |

L1 holds the **client-approved reference values**; L2-L4 are the analogous
shades from each level's own palette.

### Header / top navigation

- Sticky bar, `min-height: 80px`, white background, `padding: 5px max(10%, …)`.
- **Level icons:** `70×50`, radius `24`, number in **Sniglet 22px**.
- `scrollbar-gutter: stable` on `html` so logo/nav/icons stay pixel-identical
  across pages whether or not a page scrolls.
- At `≤1023px` the nav drops to its own centered row.

### Month-selection page (`#monthScreen`, all levels)

- Body/section background = the level's `--level-accent-soft` tint.
- **Month buttons:** `min-height: 137px`, label shows the month name (no "MONTH"
  word), tactile 3D in the level accent.
- **Box number:** **Manrope 800 / 52px**, white fill with a thin outline in the
  level's `--level-accent-shadow`; box radius `39px`.
- Layout prototyped on L4, then rolled out identically to L1-L3.

### Content (month-detail) page — V1 `#content/...` (all levels, all months)

- Background = level `--level-accent-soft` tint; text uses the readable
  `--level-accent-shadow` dark shade.
- **Centered top banner:** level name (**Sniglet 40px**) + book-band
  (**Inter 16px**) + a **month badge = bare number in a 60px circle** filled with
  `--level-accent`, number in **Manrope 800 / 36px** white. The literal "Month"
  text is hidden via `font-size:0`.
- **Month navigation row** below the topbar: **Back = previous month (left)**,
  **Next = next month (right)**. Back hidden on March (first), Next hidden on
  December (last), driven by `#contentScreen[data-month="…"]` + `app.js`
  `goToMonth(±1)`. Back no longer returns to month-select — use the nav level
  icons or the brand logo for that.
- **Lesson board (client-approved on L1/April, rolled out to all levels/months):**
  - Toolbar reduced to **Opening Song + Ending Song only**, centered (other three
    content types hidden); Opening Song's active accent dropped to match Ending.
  - Weeks numbered **continuously 1–4** across both books (in `renderLessons`).
  - **Weekday buttons (Mon–Fri):** flat tactile 3D in `--content-day-bg`, radius
    `16px` (`--radius-control`), drop shadow
    `0 7px 0 --content-day-shadow, 0 12px 18px rgba(30,90,0,.16)`; **label
    24px** in `--content-day-text`. Rules are un-scoped (`#contentScreen …`) so
    every level/month inherits them.
  - **Week-label cards (1–4 week):** **flat (2D)** on the `--content-week-tint`
    light tint (no shadow), sitting between page bg and the buttons.
  - The "X Reading Plan" `h2` (`.content-v2-title-block`) is **hidden**.
- V2 (`#content-v2/…`) and V3 (`#content-v3/…`) variants are preserved untouched.

### Footer

- Shared `.site-footer`: green (`--owl-green`) on home/overview; on any level
  screen it takes that level's `--level-accent` (via
  `body[class*="level-theme-"] .site-footer`).
- Footer text stays white (`--canvas`), `Inter 13px / 800`. ⚠ **Open item:** low
  contrast on L1 yellow.

### Standing constraints (unchanged, enforced)

- Calendar is **Mon–Fri 5-column only** (no weekend columns).
- **English UI**, **no italics**, child-friendly, touch targets ≥56px.

## Colors

> Source reference: `abc.duolingo.com/how-we-teach` CSS and page bundle, including Duolingo ABC brand tokens and page-specific teacher/ABC styles.

### Brand & Accent

- **Owl Green** (`{colors.owl-green}`): `#58CC02`; primary success/learning CTA color and the most recognizable Duolingo accent.
- **Owl Green Shadow** (`{colors.owl-green-shadow}`): `#58A700`; bottom lip/shadow for green buttons.
- **Macaw Blue** (`{colors.macaw-blue}`): `#1CB0F6`; links, active navigation, secondary CTAs, and interactive accents.
- **Macaw Blue Shadow** (`{colors.macaw-blue-shadow}`): `#1899D6`; bottom lip/shadow for blue buttons.
- **Deep Learning Blue** (`{colors.deep-blue}`): `#2B70C9`; saturated section background for major content bands.
- **Deep Learning Blue Shadow** (`{colors.deep-blue-shadow}`): `#1453A3`; pressed/shadow treatment for deep-blue buttons.
- **Sunny Yellow** (`{colors.sunny-yellow}`): `#FFC800`; reward, badge, and playful highlight color.
- **Alert Red** (`{colors.alert-red}`): `#FF4B4B`; error or attention states only.
- **Purple Accent** (`{colors.purple-accent}`): `#CE82FF`; optional content-category or reward accent.

### Surface

- **Canvas White** (`{colors.canvas}`): `#FFFFFF`; default page background and card surface.
- **Soft Gray Surface** (`{colors.surface}`): `#F7F7F7`; inputs, quiet bands, disabled surfaces.
- **Hairline** (`{colors.hairline}`): `#E5E5E5`; card borders, input borders, separators.
- **Hairline Strong** (`{colors.hairline-strong}`): `#DADADA`; stronger boundaries where needed.
- **Section Blue** (`{colors.section-blue}`): `#2B70C9`; rectangular full-width content sections.
- **Section White** (`{colors.section-white}`): `#FFFFFF`; alternating rectangular content sections.

### Text

- **Ink** (`{colors.ink}`): `#4B4B4B`; primary body text and dark headings on white.
- **Muted Ink** (`{colors.muted-ink}`): `#777777`; secondary copy, labels, descriptions.
- **Disabled** (`{colors.disabled}`): `#AFAFAF`; disabled controls and placeholder text.
- **On Color** (`{colors.on-color}`): `#FFFFFF`; text on blue, green, and saturated color sections.
- **Link Blue** (`{colors.link}`): `#1CB0F6`; text links and selected navigation.

## Typography

### Font Family

- **Display**: Feather Bold, fallback `Nunito`, `Arial Rounded MT Bold`, sans-serif.
- **UI / Body**: DIN Round, fallback `Nunito`, `Noto Sans`, `Arial Rounded MT Bold`, sans-serif.

If the exact Duolingo fonts are unavailable, use a rounded geometric fallback. The key requirement is soft terminals, high x-height, and strong child-friendly readability.

### Hierarchy

| Token                     |                       Size | Weight | Line Height | Use                             |
| ------------------------- | -------------------------: | -----: | ----------: | ------------------------------- |
| `{typography.hero}`       | 60px desktop / 40px mobile |    700 |        1.10 | Landing and major screen titles |
| `{typography.heading-1}`  | 50px desktop / 36px mobile |    700 |        1.10 | Section openers                 |
| `{typography.heading-2}`  | 40px desktop / 30px mobile |    700 |        1.15 | Page subheads                   |
| `{typography.card-title}` |                       28px |    700 |        1.15 | Card and lesson group titles    |
| `{typography.body-lg}`    | 25px desktop / 19px mobile |    500 |        1.36 | Large explanatory copy          |
| `{typography.body}`       |                       17px |    500 |        1.47 | Standard UI copy                |
| `{typography.button}`     |                       15px |    700 |        1.20 | Buttons, tabs, CTAs             |
| `{typography.label}`      |                       14px |    700 |        1.20 | Badges, short labels            |

### Principles

- Use large, friendly headings with compact line height.
- Use rounded, heavy button text; uppercase is acceptable for CTAs but avoid overusing it in learning labels.
- Body copy should be short and spacious; kindergarten users and teachers must scan quickly.
- Maintain strong contrast: white on saturated blue/green, dark ink on white cards.

## Layout

### Section System

- Sections are full-width **rectangular boxes**.
- Alternate between `section-blue` and `section-white`.
- Do not use diagonal, sloped, wavy, blob, curved, or scalloped separators.
- Section transitions must be straight horizontal boundaries.

### Container

- Max content width: `1140px`.
- Desktop horizontal page padding: `60px`.
- Tablet horizontal page padding: `30px`.
- Mobile horizontal page padding: `20px`.

### Spacing

- Base unit: `4px`.
- Primary increments: `8px`, `16px`, `24px`, `30px`, `40px`, `50px`, `60px`, `90px`.
- Hero section: `50px 30px 60px` mobile, `90px 60px` desktop.
- Standard section: `50px 30px`.
- Dense learning board section: `30px`.
- Card grid gap: `10px` mobile, `16px` tablet, `24px` desktop.

### Responsive Behavior

- Mobile-first layout.
- Major hero/content pairs stack on mobile and become two-column at `768px+`.
- Card grids are single-column on small screens, 2-up on tablet, 3-up only when content width supports it.
- Learning grids may preserve 5 columns only if labels remain readable; otherwise use horizontal scroll or compact labels.

## Shapes & Depth

### Radius

- **Control Radius** (`{rounded.control}`): `12px`; buttons and input controls.
- **Card Radius** (`{rounded.card}`): `12px`; standard content cards.
- **List Radius** (`{rounded.list}`): `14px`; grouped lists/accordion containers.
- **Pill Radius** (`{rounded.pill}`): `16px`; small badges and compact pills.
- Avoid excessive pill-only UI. Duolingo ABC uses rounded rectangles more than fully circular pills.

### Tactile Depth

- Buttons use a thick bottom lip, not a soft shadow.
- Default CTA lip: `0 4px 0 {shadow-color}`.
- Pressed state translates down by the lip height and removes the lip shadow.
- Cards are mostly flat with borders; use illustrations and color for visual energy rather than heavy shadow.

## Components

### Top Navigation

- Height: `58px` mobile, `70px` tablet/desktop.
- Background: `{colors.canvas}`.
- Shadow: `0 4px 4px rgba(0,0,0,0.03)`.
- Logo area left or centered depending on viewport.
- Active nav text: `{colors.macaw-blue}`.
- Inactive nav text: `{colors.muted-ink}`.

### Button Primary Green

- Background: `{colors.owl-green}`.
- Lip: `0 4px 0 {colors.owl-green-shadow}`.
- Text: `{colors.on-color}`.
- Radius: `{rounded.control}`.
- Height: `50px`.
- Padding: `0 16px`.
- Font: `{typography.button}`.
- Pressed: translate down `4px`, remove lip.

### Button Primary Blue

- Background: `{colors.macaw-blue}`.
- Lip: `0 4px 0 {colors.macaw-blue-shadow}`.
- Text: `{colors.on-color}`.
- Same sizing as primary green.
- Use for secondary learning actions, selected states, and contact/help actions.

### Button Stroke

- Background: `{colors.canvas}`.
- Border: `2px solid {colors.hairline}`.
- Lip: `0 2px 0 {colors.hairline}`.
- Text: `{colors.disabled}` or `{colors.macaw-blue}` for active stroke.
- Radius: `{rounded.control}`.
- Height: `50px`.

### Section Box

- Full-width rectangular block.
- No decorative section edge.
- Blue section: background `{colors.section-blue}`, text `{colors.on-color}`.
- White section: background `{colors.section-white}`, text `{colors.ink}`.
- Inner container: max-width `1140px`, centered.

### Content Card

- Background: `{colors.canvas}`.
- Border: none or `2px solid {colors.hairline}` if extra separation is needed.
- Radius: `{rounded.card}`.
- Padding: `16px` mobile, `24px` desktop.
- Layout: horizontal icon + text on wider cards; stacked only on narrow mobile.
- Text title: `{typography.card-title}`.
- Description: `{typography.body-lg}` in `{colors.muted-ink}`.

### Learning Content Button

- Use a tactile rounded rectangle, not a flat text-only tile.
- Recommended colors by content type:
  - Song: `{colors.sunny-yellow}` with dark ink.
  - Story: `{colors.purple-accent}` or `{colors.macaw-blue}` with white.
  - Chant: `{colors.owl-green}` or `{colors.macaw-blue}` with white.
  - Game/Review: `{colors.alert-red}` or purple accent with white.
- Minimum touch height: `50px`; for children, prefer `64px+`.
- Use large labels and simple icon/illustration cues where possible.

### Accordion / Curriculum List

- Container background: `{colors.canvas}`.
- Border: `2px solid {colors.hairline}`.
- Radius: `14px`.
- Item padding: `18px` mobile, `40px` desktop top spacing for expanded content.
- Expanded content can place description left and illustration right at `768px+`.

### Illustration Blocks

- Use large friendly SVG/bitmap illustrations of books, children, animals, letters, headphones, trophies, or reading scenes.
- Hero illustration max width: `340px` mobile, `500px` desktop.
- Section illustration size: `260px` mobile, `500px` desktop.
- Keep illustrations crisp, colorful, and directly tied to learning content.
- Avoid generic stock photography; use characterful educational illustrations.

### Testimonials / Teacher Cards

- Use white cards on blue sections.
- Desktop grid: 2-up at `768px`, 3-up at `1100px`.
- Mobile: carousel or single-column stack.
- Card background: white, text ink, muted metadata.

## Page Patterns

### Landing / Level Selection

- Use a rectangular hero section with a saturated blue or white background.
- Pair a short friendly headline with a large illustration.
- Place level buttons below the hero in a clear 4-card grid on tablet landscape.
- On mobile, stack level buttons 1-up or 2-up depending on available width.

### Month Selection

- Use a white or soft-gray rectangular section.
- Month buttons should be large, tactile, and clearly labeled from March to December.
- Prefer 5 columns on tablet landscape, 2 columns on mobile, 1 column on very narrow screens.

### Learning Content Selection

- Use a rectangular learning board container.
- Keep top content-type buttons visually distinct from the Mon-Fri 5-column monthly learning calendar.
- The Mon-Fri learning calendar should prioritize readability over decoration.
- If using book/character illustrations, place them as side anchors on tablet landscape and hide or simplify them on mobile.

## Do's and Don'ts

### Do

- Use Duolingo-inspired bright blue, green, white, and cheerful accents.
- Use rounded, chunky typography and strong readable labels.
- Use large, friendly learning illustrations.
- Use tactile button lips for primary actions.
- Use rectangular full-width section boxes.
- Keep white cards flat and readable on blue sections.
- Preserve generous spacing around headings and illustrations.

### Don't

- Do not use Duolingo ABC's angled, sloped, or wavy section separators.
- Do not create diagonal section masks, scalloped dividers, curved dividers, blobs, or wave borders.
- Do not copy Duolingo's exact mascot, logo, proprietary character art, or page compositions.
- Do not use thin, low-contrast text for child-facing buttons.
- Do not overload screens with tiny decorative details.
- Do not use generic photography when an illustration would communicate the lesson better.

## Responsive Behavior

| Breakpoint   |            Width | Behavior                                                        |
| ------------ | ---------------: | --------------------------------------------------------------- |
| Mobile small |        `< 360px` | Single-column cards, compact headings, simplified illustrations |
| Mobile       |  `360px - 529px` | Single-column sections, 2-up compact controls where readable    |
| Mobile large |  `530px - 767px` | Wider cards, larger illustrations, 2-up grids                   |
| Tablet       | `768px - 1099px` | Two-column hero/content rows, 2-up cards, full nav              |
| Desktop      |        `1100px+` | Max-width 1140px, 3-up cards, large 500px illustrations         |

## Implementation Notes

- Treat this file as the source of visual direction for the kindergarten learning app.
- Keep the existing user requirement for English UI.
- The design should feel like a cheerful children's reading product, not a corporate marketing page.
- Any section background change must be a straight rectangular band.
- Decorative images should support the lesson flow and never reduce button readability.
