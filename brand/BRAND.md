# Sequel Family Brand Guidelines

The Sequel family has **three operating entities**, each with its own brand guide. Every Sequel application serves exactly **one** of them, and which one is the **first question asked when a new app is started** (template `CLAUDE.md`, step 0).

| Key | Entity | Guide | Status |
|---|---|---|---|
| `SEQ` | **Sequel Ortho** | SequelOrtho Branding Guidelines v1.0 · Sept 2024 | default — no `data-entity` = SEQ |
| `FVO` | **Fox Valley Orthopedics** | Fox Valley Orthopedics Brand Guidelines v1.0 · Sept 2026 | **new identity** (replaces the tree-and-fox seal) |
| `ON` | **OrthoNebraska** | OrthoNebraska Brand Guidelines · April 2017 | |

Machine-readable sources, kept in lock-step by tests:

- [`entities.ts`](./entities.ts) — the registry: names and written forms, every official swatch (HEX/RGB/CMYK/PMS), the token role each swatch fills, typography, logo files and rules.
- [`theme.css`](./theme.css) — the Tailwind v4 layer. `:root` is Sequel Ortho; `:root[data-entity="FVO"|"ON"]` (+ `[data-theme="dark"]`) blocks re-pitch the same tokens. [`tokens.css`](./tokens.css) is the framework-free mirror (light values).
- [`palette.ts`](./palette.ts) — the same values in JavaScript for charts and exporters (`brandColors(theme, entity)`, `seriesColors(theme, entity)`, `ENTITY_BRAND_COLORS`).

The guide PDFs are not committed (this repo is public); their rules are transcribed here and in `entities.ts`. Brand questions: Sequel — info@sequelortho.com; Fox Valley — Marketing@FVOrtho.com; OrthoNebraska — the marketing contact named in its guide.

## How an app wears its entity

1. `lib/entity.ts` holds one constant (`ENTITY_KEY`), set by the template's `scripts/set-entity.mjs`.
2. The root layout renders `<html data-entity={ENTITY_KEY}>` (server-side — no flash) and the header logo as `<EntityLogo entity={ENTITY_KEY} />`.
3. Everything else follows: `bg-brand` / `text-brand-navy` / `bg-brand-accent` / `blue-*` / the focus ring / `Button` variants / `useBrandColors()` charts / fonts. Exporters pass the key: `docxBrand(key)`, `headerFill(key)`, deck `defaultBrand: key`.
4. `app/icon.png` is a byte copy of `brand/assets/<key>/icon.png` (template test enforces it).

**Never hand-pick a hex.** Status colors — RYG, success, warning, danger, the deck critical-row maroon — are family-wide and identical in every entity.

## Token roles per entity

Each guide's palette maps onto the same token roles. Light values are the guides' published HEX; "derived" values are hover/pressed or neutral steps computed from them (the guides don't define them).

| Role (token) | Used for | Sequel Ortho | Fox Valley Orthopedics | OrthoNebraska |
|---|---|---|---|---|
| navy (`--brand-navy`) | headlines on light, `secondary` button, deck/table header fills | Dark Blue `#0F1263` | Dark Green `#14332D` (PMS 627) | OrthoNebraska Blue `#25245C` (PMS 2757 mix) |
| primary (`--brand-primary`) | CTAs, links, h2, focus ring | Light Blue `#009DDD` | Green `#177255` (PMS 6159) | Blue `#0072CE` (PMS 285) |
| primary 600 / 700 | hover / pressed (derived) | `#0083BD` / `#006A9C` | `#136047` / `#104E3A` | `#0060AD` / `#004E8C` |
| navy-muted | secondary hover (derived) | `#232A7A` | `#15493B` | `#3F3E70` |
| accent (`--brand-accent`) | **assign / hand-off actions only**, dark ink | Lime `#CAD400` | Yellow `#F4D659` (PMS 128) | Lime `#D2D755` (PMS 584) |
| highlight | document accent rules / deck bars | Lime `#CAD400` | Light Green `#14C579` (PMS 7479) | Lime `#D2D755` |
| muted (`--brand-muted`) | helper / secondary text | Grey `#707372` | `#5B6964` (derived green-grey; the guide has no grey) | Cool Gray 10 `#63666A` |
| surface (`--brand-surface`) | tinted panels | `#F8F8F8` | Web Light `#F2F4F4` | `#F8F8F8` |
| foreground | body text | `#171717` | Web Black `#1E1E1E` | `#171717` |

Dark mode: every entity has its own lightened values in `theme.css` (FVO primary → Light Green `#14C579`; ON primary → PMS 299 `#00A3E0`; navies → pale tints). Never the light palette on near-black, never per-app dark values.

All text roles are WCAG AA on their grounds (FVO primary 5.9:1, ON primary 4.9:1, every muted ≥ 5.2:1 on white and surface).

### Full official palettes

**Sequel Ortho** — Dark Blue `#0F1263` (RGB 15,18,99) · Light Blue `#009DDD` (0,157,221) · Lime `#CAD400` (202,212,0) · Grey `#707372` (112,115,114). Tints at 80/60/40%.

**Fox Valley Orthopedics** — *Primary:* Dark Green `#14332D` (PMS 627) · Green `#177255` (PMS 6159) · Light Green `#14C579` (PMS 7479). *Secondary* (sparingly — to direct attention, create points of interest): Yellow `#F4D659` (PMS 128) · Orange `#F07D42` (PMS 4012). *Website only* (backgrounds and text, never print): `#1E1E1E`, `#F2F4F4`. **No other colors.** Approved pairings: palette colors with black or white, not with one another (yellow / orange / light green on dark green are approved; dark ink on yellow, orange, light green).

**OrthoNebraska** — OrthoNebraska Blue `#25245C` (custom mix, PMS 2757; vinyl Avery Dark Blue UC 900-695-O) · PMS 285 `#0072CE` · PMS 513 `#93328E` · PMS 584 `#D2D755` · PMS 361 `#43B02A` · PMS 299 `#00A3E0` · Cool Gray 10 `#63666A` · Black `#231F20` · White.

## Typography

| | In-app (web) | Generated docx / xlsx | Brand faces (reference) |
|---|---|---|---|
| **SEQ** | Montserrat | Montserrat | Quantify2 (primary), Sifonn Pro, Montserrat (secondary & body) |
| **FVO** | **Montserrat headings, Open Sans body** | Montserrat headings, Open Sans body | Montserrat (headlines/subheads — never body copy); Open Sans (body). Hierarchy: headline Montserrat ExtraBold, subhead Montserrat Bold, intro/body/footnote Open Sans Regular |
| **ON** | Montserrat (Gotham's web alternative); Arvo for any serif accent | **Arial** (Georgia for serif) | Gotham (primary, logo face) and Archer (serif, never in a logo) are licensed; Montserrat & Arvo are web-only (never print); Arial & Georgia for internal communications and presentations |

`theme.css` carries the roles as `--brand-font-body` / `--brand-font-heading` (`font-sans` / `font-heading` utilities). Load via `next/font/google`: Montserrat → `--font-montserrat`, Open Sans → `--font-open-sans` (FVO), Geist Mono → `--font-geist-mono` (code/tabular, every entity). Decks keep the template master's Montserrat for all three entities.

## Logos

Files in [`assets/`](./assets), rendered from the guides' vector artwork at 1200 dpi and recolored to the published HEX ([`scripts/extract-entity-logos.py`](../scripts/extract-entity-logos.py) rebuilds them when a guide is revised). Use `<EntityLogo entity=… />` (`@sequel/foundation/brand/EntityLogo`): `auto` shows **color** on light and **reverse** in dark mode; pin `variant="white"` on photos or brand-color grounds.

| Entity | color (light grounds) | reverse (dark grounds) | white (one-color) | mark | favicon |
|---|---|---|---|---|---|
| SEQ | `logo-navy.png` | `logo-white.png` | `logo-white.png` | `seq/icon.png` | `seq/icon.png` |
| FVO | `fvo/logo-color.png` — primary lockup, three greens | `fvo/logo-reverse.png` — green mark, white wordmark (the guide's "on black" variation) | `fvo/logo-white.png` | `fvo/mark.png` | `fvo/icon.png` |
| ON | `on/logo-color.png` — **vertical lockup (preferred)**, gradient mark | `on/logo-reverse.png` — gradient mark, white wordmark | `on/logo-white.png` (Reverse) | `on/mark.png` | `on/icon.png` |

`banner.png` is Sequel's blue-gradient marketing/social lockup.

### Rules from the guides

- **Never alter the artwork** (all three): no stretching, skewing, recoloring outside the approved treatments, re-arranging or resizing elements, effects or drop shadows, added elements, or rotation.
- **Sequel Ortho** — accepted treatments only (full-color, navy, light-blue, black, white-on-blue; with or without the "Reach. Restore. Recover." tagline; wordmark-only). Don't stack the mark above the wordmark, rotate the lockup, or set it on low-contrast photography.
- **Fox Valley Orthopedics** — *Clear space:* the height of the F in "Fox" on all four sides. *Minimum digital heights:* primary lockup 22 px, vertical 54 px, seal 84 px, icon 29 px. *Backgrounds:* three-color on light solids; one-color white on dark photos (never the three-color); one-color black on low-contrast patterns; nothing on busy, high-contrast imagery. The **seal lockup is for apparel and swag only** — never in place of the primary logo or in advertising, so it is not shipped here. With the icon-only mark, the name must appear nearby.
- **OrthoNebraska** — *Clear space:* the height of the "N". *Orientation:* vertical is preferred; horizontal only where height is short; the icon alone only alongside other branding (social, in-office). Tagline ("Journey On") version for external communications only; unit lockups internal only; never alter the subtext treatment.

## Written appearance

- **Sequel Ortho** — two words: "Sequel Ortho". Tagline: *Reach. Restore. Recover.*
- **Fox Valley Orthopedics** — "Fox Valley Orthopedics", "Fox Valley Ortho", or "FVO". American spelling **orthopedic** (never "orthopaedic" except inside a legal entity name that requires it). Locations: "Fox Valley Orthopedics Algonquin"; physical-therapy-only sites insert "Physical Therapy" before the place: "Fox Valley Orthopedics Physical Therapy Aurora". Current locations: Algonquin, Physical Therapy Aurora, Barrington, Elgin-Randall, Elgin-Royal, Elgin-Lin Lor, Geneva-North, Geneva-South, Physical Therapy Huntley, Physical Therapy Yorkville.
- **OrthoNebraska** — always **one word with a capital O and N**: "OrthoNebraska". Tagline: *Journey On.*

The registry carries these as `ENTITIES[k].writtenForms` / `writtenRule` — use `ENTITIES[k].name` in UI copy and exports instead of retyping a name.
