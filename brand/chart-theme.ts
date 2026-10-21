import type { EntityKey } from "./entities";
import { brandColors, type ThemeName } from "./palette";

// Readable chart chrome from the brand palette (UX audit 2026-10-21, FND-19).
// Recharts' defaults are a white tooltip whose text inherits the page color
// (white on white in dark mode) and #666 axis ticks (about 3.2:1 on a dark
// card). Spread these into the chart parts instead:
//
//   const t = chartTheme(useThemeName(), useEntityKey());   // or useChartTheme()
//   <Tooltip {...t.tooltip} />  <XAxis tick={t.axisTick} stroke={t.axisLine} />
//   <CartesianGrid stroke={t.grid} />  <Legend wrapperStyle={t.legend} />
//
// Plain objects only, so a server-rendered SVG or an exporter can use them too.

export type ChartTheme = {
  tooltip: {
    contentStyle: Record<string, string | number>;
    labelStyle: Record<string, string | number>;
    itemStyle: Record<string, string | number>;
    cursor: { fill: string };
  };
  axisTick: { fill: string; fontSize: number };
  axisLine: string;
  grid: string;
  legend: Record<string, string | number>;
};

// Card grounds the hubs put charts on: white / zinc-900.
const CARD = { light: "#ffffff", dark: "#18181b" } as const;
const BORDER = { light: "#d4d4d8", dark: "#3f3f46" } as const;
const TEXT = { light: "#18181b", dark: "#f4f4f5" } as const;
const TICK = { light: "#52525b", dark: "#a1a1aa" } as const; // 7.7:1 / 6.9:1 on their cards

export function chartTheme(theme: ThemeName, entity?: EntityKey): ChartTheme {
  const c = brandColors(theme, entity);
  return {
    tooltip: {
      contentStyle: {
        backgroundColor: CARD[theme],
        border: `1px solid ${BORDER[theme]}`,
        borderRadius: 6,
        color: TEXT[theme],
        fontSize: 12,
      },
      labelStyle: { color: TEXT[theme], fontWeight: 600 },
      itemStyle: { color: TEXT[theme] },
      cursor: { fill: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
    },
    axisTick: { fill: TICK[theme], fontSize: 12 },
    axisLine: BORDER[theme],
    grid: theme === "dark" ? "#27272a" : "#e4e4e7",
    legend: { color: theme === "dark" ? TEXT.dark : c.navy, fontSize: 12 },
  };
}
