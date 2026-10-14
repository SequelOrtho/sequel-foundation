// Multi-select list filters (DESIGN-CONVENTIONS §3, "List filters take several
// values"; first built for the Project Hub's 2027 plan list, PMO 2026-10-14:
// "all the Sprint and MGP projects that are priority 1 & 2"). One rule for
// every filter that lets several values be picked: values within one filter
// combine as OR, separate filters combine as AND (the caller chains them), and
// nothing picked means the filter is off. Pure, so views and tests share it.

/** True when `value` passes a filter with `selected` values picked (none picked = off). */
export function passesMulti(selected: readonly string[], value: string | null | undefined): boolean {
  if (selected.length === 0) return true;
  return value != null && selected.includes(value);
}

/** Toggle one value in a selection, keeping the options' own order. */
export function toggleMulti(selected: readonly string[], id: string, order: readonly string[]): string[] {
  const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
  const rank = (v: string) => {
    const i = order.indexOf(v);
    return i < 0 ? order.length : i;
  };
  return [...next].sort((a, b) => rank(a) - rank(b));
}

/**
 * The closed control's text: the "all" label when nothing is picked, the
 * option's own label for one, the labels joined for two, a count beyond that.
 */
export function multiSummary(
  selected: readonly string[],
  options: readonly { id: string; label: string }[],
  allLabel: string,
  noun: string,
): string {
  if (selected.length === 0) return allLabel;
  const labels = selected.map((id) => options.find((o) => o.id === id)?.label ?? id);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels.length} ${noun}`;
}
