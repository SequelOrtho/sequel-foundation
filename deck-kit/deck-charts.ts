import type { IPptxGenJSSlide } from "pptx-automizer";
import { FONT } from "./fonts";

// Native-shape chart primitives for board-quality decks — drawn with pptxgenjs
// shapes/text (no images, no addChart) so they render through the pptx-automizer
// interop, stay fully editable in PowerPoint, and carry the Sequel brand. Built
// for the standard 16:9 content area (≈11.5" wide); every helper takes an
// explicit {x,y,w,h} region so slides compose them freely. The aesthetic mirrors
// the Acquisition Hub pitch graphics: rounded tinted cards, accent bars, big
// numerals, connector lines, RYG fills.

const NAVY = "0F1263";
const BLUE = "009DDD";
const LIME = "CAD400";
const GREEN = "16A34A";
const AMBER = "D97706";
const RED = "DC2626";
const GREY = "707372";
const BODY = "27272A";
const CARD = "F4F6FB"; // light navy-tinted card
const TRACK = "ECEDF3"; // empty bar / track
const BORDER = "E4E4E7";
const WHITE = "FFFFFF";

// A rotating palette for categorical series (pillars, segments) — brand-forward.
export const SERIES_COLORS = [NAVY, BLUE, "43B02A", "93328E", AMBER, "00A3E0"];

export const CHART_PALETTE = { NAVY, BLUE, LIME, GREEN, AMBER, RED, GREY, BODY, CARD, TRACK, BORDER, WHITE };

const s = (g: IPptxGenJSSlide, kind: string, o: Record<string, unknown>) =>
  g.addShape(kind as never, o as never);
const t = (g: IPptxGenJSSlide, c: string, o: Record<string, unknown>) =>
  g.addText(c as never, { fontFace: FONT, ...o } as never);

const fmtM = (n: number) => `$${n.toFixed(1)}M`;

// ---- KPI tile: a big-number card with an accent top bar ----
export function kpiTile(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; value: string; label: string; color?: string; accent?: string; sub?: string },
) {
  const { x, y, w, h, value, label, color = NAVY, accent = LIME, sub } = opts;
  s(g, "roundRect", { x, y, w, h, rectRadius: 0.06, fill: { color: CARD }, line: { color: BORDER, width: 1 } });
  s(g, "rect", { x, y, w, h: 0.1, fill: { color: accent } });
  t(g, value, { x: x + 0.15, y: y + 0.22, w: w - 0.3, h: h * 0.5, align: "center", valign: "middle", bold: true, fontSize: 34, color });
  t(g, label.toUpperCase(), { x: x + 0.15, y: y + h * 0.6, w: w - 0.3, h: h * 0.24, align: "center", valign: "top", fontSize: 10, color: GREY, charSpacing: 1 });
  if (sub) t(g, sub, { x: x + 0.15, y: y + h * 0.82, w: w - 0.3, h: h * 0.18, align: "center", valign: "top", fontSize: 9, italic: true, color: GREY });
}

// ---- coverage / progress bar with a 100% target tick ----
export function coverageBar(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; pct: number | null; label: string; valueLabel: string },
) {
  const { x, y, w, pct, label, valueLabel } = opts;
  t(g, label, { x, y, w: w * 0.7, h: 0.3, fontSize: 12, bold: true, color: NAVY, valign: "middle" });
  t(g, valueLabel, { x: x + w * 0.6, y, w: w * 0.4, h: 0.3, fontSize: 12, bold: true, color: GREY, align: "right", valign: "middle" });
  const trackY = y + 0.36;
  const trackH = 0.34;
  s(g, "roundRect", { x, y: trackY, w, h: trackH, rectRadius: 0.05, fill: { color: TRACK } });
  if (pct != null) {
    const frac = Math.max(0.01, Math.min(1, pct / 100));
    const c = pct >= 75 ? GREEN : pct >= 50 ? AMBER : RED;
    s(g, "roundRect", { x, y: trackY, w: w * frac, h: trackH, rectRadius: 0.05, fill: { color: c } });
  }
}

// ---- value bridge as a floating-column waterfall (EBITDA $M or MOIC x) ----
// `achieved` (optional, increments only) shades that much of the segment solid
// from its base — the faded remainder is still-to-deliver plan value. `fmt`
// formats value labels (defaults to $M); increments get a `+` prefix.
// `fmtProgress` (optional) prints a per-bar `▲ <achieved>` line under the
// category label of every increment carrying progress — zero-suppressed: a
// bar whose achieved formats the same as zero prints nothing. Passing it
// reserves an extra label row below the axis.
export type WaterfallBar = { label: string; kind: "baseline" | "increment" | "total"; start: number; end: number; value: number; achieved?: number };
export function waterfall(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; bars: WaterfallBar[]; target?: number | null; fmt?: (n: number) => string; fmtProgress?: (n: number) => string },
) {
  const { x, y, w, h, bars, target, fmtProgress } = opts;
  const fmt = opts.fmt ?? fmtM;
  // Room for wrapped category labels under the axis — plus the per-bar
  // achieved line when fmtProgress is active.
  const plotH = h - (fmtProgress ? 0.86 : 0.62);
  const max = Math.max(...bars.map((b) => b.end), target ?? 0) * 1.12 || 1;
  const sy = (v: number) => (v / max) * plotH;
  const n = bars.length;
  // Loop-invariant: the zero-suppression test compares each bar's formatted
  // progress against formatted zero, and fmtProgress is caller-supplied (cost
  // unknown). Compute it once instead of once per bar.
  const zeroProgress = fmtProgress ? fmtProgress(0) : null;
  const gap = Math.min(0.3, w * 0.03);
  const bw = (w - gap * (n - 1)) / n;
  const axisY = y + plotH;
  s(g, "line", { x, y: axisY, w, h: 0, line: { color: BORDER, width: 1 } });
  if (target != null && target > 0) {
    s(g, "line", { x, y: axisY - sy(target), w, h: 0, line: { color: AMBER, width: 1.25, dashType: "dash" } });
    t(g, `Target ${fmt(target)}`, { x: x + w - 1.9, y: axisY - sy(target) - 0.26, w: 1.9, h: 0.24, fontSize: 9, bold: true, color: AMBER, align: "right" });
  }
  bars.forEach((b, i) => {
    const bx = x + i * (bw + gap);
    const lo = b.kind === "increment" ? Math.min(b.start, b.end) : 0;
    const hi = b.kind === "increment" ? Math.max(b.start, b.end) : b.end;
    const barY = axisY - sy(hi);
    const barH = Math.max(0.04, sy(hi) - sy(lo));
    if (b.kind === "increment") {
      const frac = b.achieved != null && b.value > 0 ? Math.min(1, Math.max(0, b.achieved / b.value)) : 0;
      const doneH = barH * frac;
      s(g, "rect", { x: bx, y: barY, w: bw, h: barH, fill: { color: BLUE, transparency: 65 } });
      if (doneH > 0.01) s(g, "rect", { x: bx, y: barY + barH - doneH, w: bw, h: doneH, fill: { color: BLUE } });
    } else {
      s(g, "rect", { x: bx, y: barY, w: bw, h: barH, fill: { color: NAVY } });
    }
    // connector from this bar's top to the next bar's base level
    if (i < n - 1 && b.kind !== "total") {
      s(g, "line", { x: bx + bw, y: axisY - sy(b.end), w: gap, h: 0, line: { color: GREY, width: 0.75, dashType: "dash" } });
    }
    // value label above the bar
    const vlabel = b.kind === "increment" ? `+${fmt(b.value)}` : fmt(b.end);
    t(g, vlabel, { x: bx - 0.1, y: barY - 0.26, w: bw + 0.2, h: 0.24, align: "center", fontSize: 9.5, bold: true, color: b.kind === "increment" ? BLUE : NAVY });
    // category label below the axis (long pillar names wrap — deterministic 8pt)
    t(g, b.label, { x: bx - 0.12, y: axisY + 0.06, w: bw + 0.24, h: fmtProgress ? 0.4 : 0.56, align: "center", valign: "top", fontSize: 8, color: BODY });
    // per-bar achieved line (zero-suppressed; increments only)
    const achieved = b.achieved ?? 0;
    if (fmtProgress && b.kind === "increment" && achieved > 0) {
      const progress = fmtProgress(achieved);
      if (progress !== zeroProgress) {
        t(g, `▲ ${progress}`, { x: bx - 0.12, y: axisY + 0.5, w: bw + 0.24, h: 0.24, align: "center", fontSize: 8.5, bold: true, color: NAVY });
      }
    }
  });
}

// ---- achieved-to-date callout (the printed progress detail) ----
// House convention (DECK-CRAFT §4): a chart that shades achieved-to-date also
// prints the numbers — "▲ Achieved to date: <achieved> of <goal> <noun>
// (<pct>%)" as blue ▲ + bold navy body + optional grey tail. Renders nothing
// when achieved or goal is not positive, so callers pass raw totals unguarded.
export function achievedCallout(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; achieved: number; goal: number; fmt?: (n: number) => string; noun?: string; tail?: string; fontSize?: number },
) {
  const { x, y, w, achieved, goal } = opts;
  if (!(achieved > 0) || !(goal > 0)) return;
  const fmt = opts.fmt ?? fmtM;
  const noun = opts.noun ?? "plan growth";
  const runs = [
    { text: "▲ ", options: { color: BLUE, bold: true } },
    {
      text: `Achieved to date: ${fmt(achieved)} of ${fmt(goal)} ${noun} (${Math.round((achieved / goal) * 100)}%)`,
      options: { color: NAVY, bold: true },
    },
    ...(opts.tail ? [{ text: `   ${opts.tail}`, options: { color: GREY, bold: false } }] : []),
  ];
  g.addText(runs as never, { x, y, w, h: 0.32, fontFace: FONT, fontSize: opts.fontSize ?? 11.5 } as never);
}

// ---- horizontal bar chart (ranked) ----
export type HBarItem = { label: string; value: number; color?: string; valueLabel?: string; sublabel?: string };
export function hBarChart(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; items: HBarItem[]; maxValue?: number; labelW?: number },
) {
  const { x, y, w, h, items } = opts;
  const labelW = opts.labelW ?? w * 0.34;
  const valueW = 1.0;
  const barX = x + labelW;
  const barMaxW = w - labelW - valueW;
  const maxValue = opts.maxValue ?? Math.max(1, ...items.map((it) => it.value));
  const rowH = h / Math.max(1, items.length);
  const barH = Math.min(0.34, rowH * 0.5);
  items.forEach((it, i) => {
    const cy = y + i * rowH;
    t(g, it.label, { x, y: cy, w: labelW - 0.12, h: it.sublabel ? rowH * 0.62 : rowH, valign: "middle", fontSize: 10.5, bold: true, color: NAVY });
    if (it.sublabel) t(g, it.sublabel, { x, y: cy + rowH * 0.56, w: labelW - 0.12, h: rowH * 0.4, valign: "top", fontSize: 8.5, italic: true, color: GREY });
    const by = cy + rowH / 2 - barH / 2;
    s(g, "roundRect", { x: barX, y: by, w: barMaxW, h: barH, rectRadius: 0.03, fill: { color: TRACK } });
    const frac = maxValue > 0 ? Math.max(0.012, it.value / maxValue) : 0;
    s(g, "roundRect", { x: barX, y: by, w: barMaxW * frac, h: barH, rectRadius: 0.03, fill: { color: it.color ?? NAVY } });
    t(g, it.valueLabel ?? String(it.value), { x: barX + barMaxW + 0.08, y: cy, w: valueW - 0.08, h: rowH, valign: "middle", fontSize: 10.5, bold: true, color: it.color ?? NAVY });
  });
}

// ---- target-vs-actual bars: a target track with a credited fill, per row ----
export type TargetBar = { label: string; target: number; actual: number; note?: string };
export function targetVsActualBars(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; rows: TargetBar[]; max?: number },
) {
  const { x, y, w, h, rows } = opts;
  const labelW = w * 0.3;
  const moneyW = 1.9;
  const barX = x + labelW;
  const barMaxW = w - labelW - moneyW;
  const max = opts.max ?? Math.max(1, ...rows.map((r) => r.target));
  const rowH = h / Math.max(1, rows.length);
  const barH = Math.min(0.3, rowH * 0.42);
  rows.forEach((r, i) => {
    const cy = y + i * rowH;
    // left: pillar name + a quiet sublabel (claimed % · efforts)
    t(g, r.label, { x, y: cy, w: labelW - 0.12, h: r.note ? rowH * 0.58 : rowH, valign: "middle", fontSize: 10.5, bold: true, color: NAVY });
    if (r.note) t(g, r.note, { x, y: cy + rowH * 0.54, w: labelW - 0.12, h: rowH * 0.42, valign: "top", fontSize: 8.5, italic: true, color: GREY });
    const by = cy + rowH / 2 - barH / 2;
    // target track ∝ target, credited fill ∝ actual — labels live OUTSIDE the bar
    const trackW = Math.max(0.04, barMaxW * (r.target / max));
    s(g, "roundRect", { x: barX, y: by, w: trackW, h: barH, rectRadius: 0.03, fill: { color: TRACK }, line: { color: BORDER, width: 0.75 } });
    const fillW = Math.max(0, barMaxW * (Math.min(r.actual, r.target) / max));
    if (fillW > 0) s(g, "roundRect", { x: barX, y: by, w: Math.max(0.04, fillW), h: barH, rectRadius: 0.03, fill: { color: NAVY } });
    // right: credited / target money
    t(g, `${fmtM(r.actual)} / ${fmtM(r.target)}`, { x: barX + barMaxW + 0.1, y: cy, w: moneyW - 0.1, h: rowH, valign: "middle", fontSize: 9.5, bold: true, color: NAVY });
  });
}

// ---- cumulative column chart (walk-forward) with a target line + actual markers ----
export function columnChart(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; labels: string[]; values: number[]; actual?: (number | null)[]; target?: number | null; valueFmt?: (n: number) => string },
) {
  const { x, y, w, h, labels, values, actual, target } = opts;
  const fmt = opts.valueFmt ?? ((n: number) => n.toFixed(1));
  const plotH = h - 0.45;
  const axisY = y + plotH;
  const max = Math.max(...values, target ?? 0, 1) * 1.15;
  const sy = (v: number) => (v / max) * plotH;
  const n = labels.length;
  const gap = Math.min(0.3, w * 0.04);
  const bw = (w - gap * (n - 1)) / n;
  s(g, "line", { x, y: axisY, w, h: 0, line: { color: BORDER, width: 1 } });
  if (target != null && target > 0) {
    s(g, "line", { x, y: axisY - sy(target), w, h: 0, line: { color: AMBER, width: 1.25, dashType: "dash" } });
    t(g, `Target ${fmt(target)}`, { x, y: axisY - sy(target) - 0.26, w: w, h: 0.24, fontSize: 9, bold: true, color: AMBER, align: "right" });
  }
  labels.forEach((lab, i) => {
    const bx = x + i * (bw + gap);
    const v = values[i] ?? 0;
    const barY = axisY - sy(v);
    s(g, "rect", { x: bx, y: barY, w: bw, h: Math.max(0.04, sy(v)), fill: { color: NAVY } });
    t(g, fmt(v), { x: bx - 0.1, y: barY - 0.24, w: bw + 0.2, h: 0.22, align: "center", fontSize: 9, bold: true, color: NAVY });
    // actual marker (delivered) — a green cap where present
    const a = actual?.[i];
    if (a != null) {
      const ay = axisY - sy(a);
      s(g, "rect", { x: bx, y: ay - 0.03, w: bw, h: 0.06, fill: { color: GREEN } });
    }
    t(g, lab, { x: bx - 0.12, y: axisY + 0.06, w: bw + 0.24, h: 0.36, align: "center", valign: "top", fontSize: 9, color: BODY });
  });
}

// ---- 100% stacked share bar with a legend ----
export type ShareSegment = { label: string; pct: number };
export function stackedShareBar(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h?: number; segments: ShareSegment[] },
) {
  const { x, y, w } = opts;
  const h = opts.h ?? 0.7;
  const segs = opts.segments.filter((sg) => sg.pct > 0);
  let cx = x;
  segs.forEach((sg, i) => {
    const sw = w * (sg.pct / 100);
    const col = SERIES_COLORS[i % SERIES_COLORS.length];
    s(g, "rect", { x: cx, y, w: sw, h, fill: { color: col } });
    if (sw > 0.5) t(g, `${sg.pct}%`, { x: cx, y, w: sw, h, align: "center", valign: "middle", fontSize: 11, bold: true, color: WHITE });
    cx += sw;
  });
  // legend below — chips wrap across up to 3 columns
  const cols = Math.min(3, Math.max(1, segs.length));
  const colW = w / cols;
  const legY = y + h + 0.22;
  segs.forEach((sg, i) => {
    const col = SERIES_COLORS[i % SERIES_COLORS.length];
    const lx = x + (i % cols) * colW;
    const ly = legY + Math.floor(i / cols) * 0.34;
    s(g, "rect", { x: lx, y: ly + 0.04, w: 0.2, h: 0.2, fill: { color: col } });
    t(g, sg.label, { x: lx + 0.3, y: ly, w: colW - 0.4, h: 0.28, valign: "middle", fontSize: 10, color: BODY });
  });
}

// ---- funnel: centered descending bars (intake pipeline) ----
export type FunnelStage = { label: string; count: number };
const FUNNEL_RAMP = ["0F1263", "232A82", "009DDD", "49B6E5", "8FD0EE", "BFE4F6"];
export function funnelChart(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; stages: FunnelStage[] },
) {
  const { x, y, w, h, stages } = opts;
  const n = Math.max(1, stages.length);
  const gap = 0.14;
  const rowH = (h - gap * (n - 1)) / n;
  const max = Math.max(1, ...stages.map((sg) => sg.count));
  stages.forEach((sg, i) => {
    const frac = Math.max(0.14, sg.count / max);
    const bw = w * frac;
    const bx = x + (w - bw) / 2;
    const cy = y + i * (rowH + gap);
    const col = FUNNEL_RAMP[Math.min(i, FUNNEL_RAMP.length - 1)];
    s(g, "roundRect", { x: bx, y: cy, w: bw, h: rowH, rectRadius: 0.04, fill: { color: col } });
    const dark = i < 3; // deep bars take white text; the lighter lower bars take navy
    t(g, sg.label, { x: bx, y: cy + rowH * 0.12, w: bw, h: rowH * 0.46, align: "center", valign: "middle", bold: true, fontSize: 11.5, color: dark ? WHITE : NAVY });
    t(g, String(sg.count), { x: bx, y: cy + rowH * 0.5, w: bw, h: rowH * 0.42, align: "center", valign: "middle", bold: true, fontSize: 14, color: dark ? WHITE : NAVY });
  });
}

// ---- numbered callout cards (risks, decisions requested) ----
export function numberedCards(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; bottom: number; items: string[]; accent?: string },
) {
  const { x, y, w, bottom, items, accent = NAVY } = opts;
  const n = Math.max(1, items.length);
  const gap = 0.16;
  const rowH = Math.min(0.92, (bottom - y - gap * (n - 1)) / n);
  items.forEach((it, i) => {
    const cy = y + i * (rowH + gap);
    s(g, "roundRect", { x, y: cy, w, h: rowH, rectRadius: 0.05, fill: { color: CARD }, line: { color: BORDER, width: 0.75 } });
    const r = 0.44;
    s(g, "ellipse", { x: x + 0.16, y: cy + rowH / 2 - r / 2, w: r, h: r, fill: { color: accent } });
    t(g, String(i + 1), { x: x + 0.16, y: cy + rowH / 2 - r / 2, w: r, h: r, align: "center", valign: "middle", bold: true, fontSize: 13, color: WHITE });
    t(g, it, { x: x + 0.78, y: cy, w: w - 0.94, h: rowH, valign: "middle", fontSize: 11, color: BODY });
  });
}

// ---- start→finish dumbbell rows (VCP realization: initial vs final score) ----
// A 0–max track per row with a hollow navy dot at the start (initial /
// underwritten) and a filled dot at the finish (realized): green at/above the
// start, red below — icon position + colour together, never colour alone.
// Web twin: app/vcp/RealizedOutcomes.tsx <Dumbbell/>; keep the encodings agreeing.
export type DumbbellRow = { label: string; sublabel?: string; start: number; end: number | null; rightLabel: string };
export function dumbbellChart(
  g: IPptxGenJSSlide,
  opts: { x: number; y: number; w: number; h: number; rows: DumbbellRow[]; max?: number },
) {
  const { x, y, w, h, rows } = opts;
  const max = opts.max ?? 100;
  const labelW = w * 0.32;
  const rightW = 1.75;
  const trackX = x + labelW;
  const trackW = w - labelW - rightW - 0.15;
  const rowH = h / Math.max(1, rows.length);
  const dot = 0.13;
  const px = (v: number) => trackX + trackW * (Math.max(0, Math.min(max, v)) / max);
  rows.forEach((r, i) => {
    const cy = y + i * rowH;
    const midY = cy + rowH / 2;
    t(g, r.label, { x, y: cy, w: labelW - 0.12, h: r.sublabel ? rowH * 0.58 : rowH, valign: "middle", fontSize: 10, bold: true, color: NAVY });
    if (r.sublabel)
      t(g, r.sublabel, { x, y: cy + rowH * 0.54, w: labelW - 0.12, h: rowH * 0.42, valign: "top", fontSize: 8, italic: true, color: GREY });
    s(g, "roundRect", { x: trackX, y: midY - 0.015, w: trackW, h: 0.03, rectRadius: 0.01, fill: { color: TRACK } });
    if (r.end != null) {
      const up = r.end >= r.start;
      const c = up ? GREEN : RED;
      const x1 = Math.min(px(r.start), px(r.end));
      const x2 = Math.max(px(r.start), px(r.end));
      if (x2 - x1 > 0.02)
        s(g, "rect", { x: x1, y: midY - 0.025, w: x2 - x1, h: 0.05, fill: { color: c, transparency: 45 } });
      s(g, "ellipse", { x: px(r.start) - dot / 2, y: midY - dot / 2, w: dot, h: dot, fill: { color: WHITE }, line: { color: NAVY, width: 1.75 } });
      s(g, "ellipse", { x: px(r.end) - dot / 2, y: midY - dot / 2, w: dot, h: dot, fill: { color: c } });
    } else {
      s(g, "ellipse", { x: px(r.start) - dot / 2, y: midY - dot / 2, w: dot, h: dot, fill: { color: WHITE }, line: { color: NAVY, width: 1.75 } });
    }
    t(g, r.rightLabel, { x: trackX + trackW + 0.15, y: cy, w: rightW, h: rowH, valign: "middle", fontSize: 9.5, bold: true, color: NAVY });
  });
}
