export type ComboOption = {
  id: number | string;
  label: string;
  sublabel?: string;
  group?: string;
  /** Extra match text, e.g. "First Last" when label is "Last, First". */
  keywords?: string;
};

export function comboMatches(o: ComboOption, query: string): boolean {
  const hay = `${o.label} ${o.sublabel ?? ""} ${o.keywords ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}
