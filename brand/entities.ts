// The Sequel family's operating entities — one registry for every brand fact
// an app needs: names and how to write them, the guide's official swatches,
// typography, logo files, and the token roles each swatch fills.
//
// Every app serves exactly ONE entity, chosen first when the app is created
// (template CLAUDE.md, step 0). The choice is a single constant in the app
// (`lib/entity.ts`), stamped on <html data-entity="…">; brand/theme.css
// re-pitches every brand token from that attribute, so Tailwind classes
// (`bg-brand`, `text-brand-navy`, …) follow the entity with no per-app CSS.
// Sequel Ortho is the default — an app (or the whole existing fleet) with no
// data-entity renders exactly as before.
//
// Sources (transcribed — the PDFs are not committed; this repo is public):
//   SEQ  SequelOrtho Branding Guidelines v1.0, Sept 2024
//   FVO  Fox Valley Orthopedics Brand Guidelines v1.0, Sept 2026 (new identity)
//   ON   OrthoNebraska Brand Guidelines, April 2017
//
// Keys match the deck engine's brand keys (Project Hub's SEQ/ON/FVO template
// layouts), so one identifier names an entity everywhere. Hex values here are
// the guides' published HEX; tests/entities.test.ts ties the token roles to
// the CSS so the registry and theme.css cannot drift.

export const ENTITY_KEYS = ["SEQ", "FVO", "ON"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export const DEFAULT_ENTITY: EntityKey = "SEQ";

export function isEntityKey(v: unknown): v is EntityKey {
  return typeof v === "string" && (ENTITY_KEYS as readonly string[]).includes(v);
}

/** One official swatch, as printed in the entity's guide. */
export type EntitySwatch = {
  name: string;
  hex: string; // "#RRGGBB"
  rgb: string;
  cmyk?: string;
  pms?: string;
  /** Where the guide places it. */
  use: string;
};

/**
 * The token roles every entity fills (light theme). brand/theme.css carries
 * these as --brand-navy / --brand-primary / --brand-accent / --brand-muted /
 * --brand-surface; dark-mode re-pitches live only in the CSS + palette.ts.
 */
export type EntityRoles = {
  /** Headlines on light, deck/table header fills, `secondary` buttons. */
  navy: string;
  /** CTAs, links, h2, focus ring (`bg-brand`, `text-brand`). */
  primary: string;
  /** The assign / hand-off accent (Button `accent`) — dark ink on it, always. */
  accent: string;
  /** Decorative rule / band color in generated documents (under titles, deck accent bars). */
  highlight: string;
  /** Secondary / helper text. */
  muted: string;
  /** Tinted panel ground. */
  surface: string;
};

export type EntityFonts = {
  /** The guide's named typefaces, for reference (some are licensed, not web-loadable). */
  brand: string[];
  /** In-app: next/font families + the CSS variable each sets. */
  web: { heading: string; body: string; headingVar: string; bodyVar: string };
  /** Generated docx/xlsx text. Families every Office machine can render or that the guide names for documents. */
  documents: { heading: string; body: string };
};

export type EntityLogo = {
  /** Package-relative files (import via `@sequel/foundation/brand/assets/…`). */
  color: string; // light grounds
  reverse: string; // dark grounds (dark mode): color mark, white wordmark
  white: string; // one-color white: photos, brand-color grounds, deck covers
  mark: string; // icon-only mark
  icon: string; // favicon — app/icon.png is a byte copy of this file
  /** width / height of the color/reverse/white lockups (all three share it). */
  aspect: number;
  /** Smallest digital height the guide allows for the lockup, px (absent when the guide sets none). */
  minHeightPx?: number;
  /** Clear space rule, from the guide. */
  clearSpace: string;
  alt: string;
};

export type Entity = {
  key: EntityKey;
  /** Legal/brand name in running text. */
  name: string;
  /** Every written form the guide approves, first = preferred. */
  writtenForms: string[];
  /** The guide's written-appearance rule, verbatim in spirit. */
  writtenRule: string;
  tagline?: string;
  /** Only where the guide prints it. */
  website?: string;
  guide: { title: string; version: string; date: string; contact?: string };
  roles: EntityRoles;
  swatches: EntitySwatch[];
  fonts: EntityFonts;
  logo: EntityLogo;
  /** Short label for deck/brand pickers (BrandSlideMap.label). */
  deckLabel: string;
};

export const ENTITIES: Record<EntityKey, Entity> = {
  SEQ: {
    key: "SEQ",
    name: "Sequel Ortho",
    writtenForms: ["Sequel Ortho", "Sequel"],
    writtenRule: "Two words, both capitalized: “Sequel Ortho”. The logo lockup reads Sequel / ORTHO.",
    tagline: "Reach. Restore. Recover.",
    website: "sequelortho.com",
    guide: { title: "SequelOrtho Branding Guidelines", version: "1.0", date: "September 2024", contact: "info@sequelortho.com" },
    roles: {
      navy: "#0F1263",
      primary: "#009DDD",
      accent: "#CAD400",
      highlight: "#CAD400",
      muted: "#707372",
      surface: "#F8F8F8",
    },
    swatches: [
      { name: "Dark Blue", hex: "#0F1263", rgb: "15, 18, 99", cmyk: "100, 93, 0, 37", use: "Headlines, wordmark, dark accent" },
      { name: "Light Blue", hex: "#009DDD", rgb: "0, 157, 221", cmyk: "93, 7, 0, 0", use: "Mark, h2, CTAs, links" },
      { name: "Lime", hex: "#CAD400", rgb: "202, 212, 0", cmyk: "23, 0, 100, 3", use: "Highlight rules; in-app = hand-off accent" },
      { name: "Grey", hex: "#707372", rgb: "112, 115, 114", cmyk: "53, 41, 42, 22", use: "Body / secondary text, ORTHO" },
    ],
    fonts: {
      brand: ["Quantify2 (primary, display)", "Sifonn Pro (secondary)", "Montserrat (secondary & body)"],
      web: { heading: "Montserrat", body: "Montserrat", headingVar: "--font-montserrat", bodyVar: "--font-montserrat" },
      documents: { heading: "Montserrat", body: "Montserrat" },
    },
    logo: {
      color: "brand/assets/logo-navy.png",
      reverse: "brand/assets/logo-white.png",
      white: "brand/assets/logo-white.png",
      mark: "brand/assets/seq/icon.png",
      icon: "brand/assets/seq/icon.png",
      aspect: 810 / 230,
      clearSpace: "The guide sets no clear-space measure. Use only the accepted treatments (p.4); never rotate the lockup, stack the mark above the wordmark, or set it on low-contrast photography (p.5).",
      alt: "Sequel Ortho",
    },
    deckLabel: "Sequel Ortho",
  },

  FVO: {
    key: "FVO",
    name: "Fox Valley Orthopedics",
    writtenForms: ["Fox Valley Orthopedics", "Fox Valley Ortho", "FVO"],
    writtenRule:
      "Write “Fox Valley Orthopedics”, “Fox Valley Ortho”, or “FVO”. Use the American “orthopedic” — “orthopaedic” only inside a legal entity name that requires it. Locations read “Fox Valley Orthopedics <Place>”; PT-only sites insert “Physical Therapy” before the place (“Fox Valley Orthopedics Physical Therapy Aurora”).",
    guide: { title: "Fox Valley Orthopedics Brand Guidelines", version: "1.0", date: "September 2026", contact: "Marketing@FVOrtho.com" },
    roles: {
      navy: "#14332D",
      primary: "#177255",
      // Secondary yellow: the guide reserves secondaries for directing
      // attention, which is exactly the hand-off accent's job; dark ink on
      // yellow is an approved pairing (p.9).
      accent: "#F4D659",
      highlight: "#14C579",
      // The guide defines no grey; a dark-green-tinted neutral (derived, 5.8:1
      // on white) keeps helper text inside the palette's temperature.
      muted: "#5B6964",
      surface: "#F2F4F4",
    },
    swatches: [
      { name: "Dark Green", hex: "#14332D", rgb: "20, 51, 45", cmyk: "89, 28, 66, 83", pms: "627", use: "Primary — wordmark, headlines, dark grounds" },
      { name: "Green", hex: "#177255", rgb: "23, 114, 85", cmyk: "82, 9, 69, 36", pms: "6159", use: "Primary — mark, subheads, CTAs" },
      { name: "Light Green", hex: "#14C579", rgb: "20, 197, 121", cmyk: "70, 0, 72, 0", pms: "7479", use: "Primary — mark, renewal/optimism accents" },
      { name: "Yellow", hex: "#F4D659", rgb: "244, 214, 89", cmyk: "5, 14, 82, 0", pms: "128", use: "Secondary — sparingly, to direct attention" },
      { name: "Orange", hex: "#F07D42", rgb: "240, 125, 66", cmyk: "0, 64, 80, 0", pms: "4012", use: "Secondary — sparingly, points of interest" },
      { name: "Web Black", hex: "#1E1E1E", rgb: "30, 30, 30", use: "Website only — text" },
      { name: "Web Light", hex: "#F2F4F4", rgb: "241, 243, 245", use: "Website only — backgrounds" },
    ],
    fonts: {
      brand: ["Montserrat (headlines & subheads — never body copy)", "Open Sans (body copy)"],
      web: { heading: "Montserrat", body: "Open Sans", headingVar: "--font-montserrat", bodyVar: "--font-open-sans" },
      documents: { heading: "Montserrat", body: "Open Sans" },
    },
    logo: {
      color: "brand/assets/fvo/logo-color.png",
      reverse: "brand/assets/fvo/logo-reverse.png",
      white: "brand/assets/fvo/logo-white.png",
      mark: "brand/assets/fvo/mark.png",
      icon: "brand/assets/fvo/icon.png",
      aspect: 1322 / 240,
      minHeightPx: 22,
      clearSpace: "Clear space on all four sides equal to the height of the F in “Fox”.",
      alt: "Fox Valley Orthopedics",
    },
    deckLabel: "Fox Valley Orthopedics",
  },

  ON: {
    key: "ON",
    name: "OrthoNebraska",
    writtenForms: ["OrthoNebraska"],
    writtenRule: "Always one word with a capital O and N: “OrthoNebraska” — never “Ortho Nebraska” or “Orthonebraska”.",
    tagline: "Journey On.",
    guide: { title: "OrthoNebraska Brand Guidelines", version: "2017", date: "April 2017" },
    roles: {
      navy: "#25245C",
      primary: "#0072CE",
      // PMS 584 lime — the same role the Sequel lime plays, from the logo's own gradient.
      accent: "#D2D755",
      highlight: "#D2D755",
      muted: "#63666A",
      surface: "#F8F8F8",
    },
    swatches: [
      { name: "OrthoNebraska Blue", hex: "#25245C", rgb: "38, 36, 93", cmyk: "100, 99, 32, 25", pms: "2757 (custom mix)", use: "Wordmark, headlines, dark grounds" },
      { name: "Blue", hex: "#0072CE", rgb: "0, 114, 206", cmyk: "90, 48, 0, 0", pms: "285", use: "Gradient; links, CTAs" },
      { name: "Sky", hex: "#00A3E0", rgb: "0, 163, 224", cmyk: "86, 8, 0, 0", pms: "299", use: "Gradient; accents on dark" },
      { name: "Purple", hex: "#93328E", rgb: "147, 50, 142", cmyk: "53, 99, 0, 0", pms: "513", use: "Gradient" },
      { name: "Green", hex: "#43B02A", rgb: "67, 176, 42", cmyk: "77, 0, 100, 0", pms: "361", use: "Gradient" },
      { name: "Lime", hex: "#D2D755", rgb: "210, 215, 85", cmyk: "21, 0, 89, 0", pms: "584", use: "Gradient; in-app = hand-off accent" },
      { name: "Cool Gray", hex: "#63666A", rgb: "99, 102, 106", cmyk: "40, 30, 20, 66", pms: "Cool Gray 10", use: "Secondary text" },
      { name: "Black", hex: "#231F20", rgb: "35, 31, 32", cmyk: "0, 0, 0, 100", use: "One-color logo" },
    ],
    fonts: {
      brand: [
        "Gotham (primary sans; the logo face — licensed)",
        "Archer (complementary serif; never in a logo — licensed)",
        "Montserrat & Arvo (web alternatives — never in print)",
        "Arial & Georgia (internal communications & presentations)",
      ],
      web: { heading: "Montserrat", body: "Montserrat", headingVar: "--font-montserrat", bodyVar: "--font-montserrat" },
      documents: { heading: "Arial", body: "Arial" },
    },
    logo: {
      color: "brand/assets/on/logo-color.png",
      reverse: "brand/assets/on/logo-reverse.png",
      white: "brand/assets/on/logo-white.png",
      mark: "brand/assets/on/mark.png",
      icon: "brand/assets/on/icon.png",
      aspect: 1005 / 240,
      clearSpace: "Keep white space equal to the height of the “N” between the logo and any other element. The vertical lockup is preferred; horizontal only where height is short.",
      alt: "OrthoNebraska",
    },
    deckLabel: "OrthoNebraska",
  },
};

export function entity(key: EntityKey = DEFAULT_ENTITY): Entity {
  return ENTITIES[key];
}

/** Hex without the leading # — the form docx / pptx / ExcelJS (with an FF prefix) take. */
export function bareHex(hex: string): string {
  return hex.replace(/^#/, "").toUpperCase();
}

/** Lower-case asset directory for an entity (`seq`, `fvo`, `on`). */
export function entityAssetDir(key: EntityKey): string {
  return key.toLowerCase();
}
