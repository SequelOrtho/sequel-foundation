"use client";

import { chartTheme, type ChartTheme } from "../brand/chart-theme";
import { useEntityKey, useThemeName } from "./brand-colors";

/** chartTheme for the theme and entity stamped on <html>, kept live. */
export function useChartTheme(): ChartTheme {
  return chartTheme(useThemeName(), useEntityKey());
}
