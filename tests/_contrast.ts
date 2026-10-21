// WCAG 2.x contrast ratio between two #rrggbb colors — shared by the contrast
// tests (button-contrast, file-input-class).
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Tailwind v4.3 zinc steps as sRGB hex (its oklch values, as Chromium paints
// them), for the neutral grounds and labels the buttons and file picker use.
export const ZINC = {
  50: "#fafafa",
  100: "#f4f4f5",
  200: "#e4e4e7",
  300: "#d4d4d8",
  500: "#71717b",
  700: "#3f3f47",
  800: "#27272a",
  900: "#18181b",
} as const;
