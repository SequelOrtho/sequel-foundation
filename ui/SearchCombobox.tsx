"use client";

import { useId, useMemo, useRef, useState } from "react";
import { comboMatches, type ComboOption } from "./combo-match";

// Searchable single-select combobox (W3C APG editable-combobox-with-list
// pattern). Built for option lists that outgrew a flat <select>: type-to-filter
// with token-AND matching, full list browsable on focus, optional group
// headers, capped render with a "keep typing" hint, live result count.

export function SearchCombobox({
  options, value, onChange, label,
  placeholder = "Type to search…", disabled = false, help, maxVisible = 50,
  hideLabel = false,
}: {
  options: ComboOption[]; value: number | string | null;
  onChange: (id: number | string | null) => void;
  label: string; placeholder?: string; disabled?: boolean;
  help?: string; maxVisible?: number;
  // Render the label for screen readers only — for filter bars whose sibling
  // controls are unlabeled, where a visible label breaks row alignment.
  hideLabel?: boolean;
}) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = value != null ? (options.find((o) => o.id === value) ?? null) : null;
  const filtered = useMemo(
    () => (query.trim() ? options.filter((o) => comboMatches(o, query)) : options),
    [options, query],
  );
  const visible = filtered.slice(0, maxVisible);
  const overflow = filtered.length - visible.length;

  // Group only when any option declares a group; render order follows options.
  const groups = useMemo(() => {
    const byGroup = new Map<string, ComboOption[]>();
    for (const o of visible) byGroup.set(o.group ?? "", [...(byGroup.get(o.group ?? "") ?? []), o]);
    return [...byGroup.entries()];
  }, [visible]);

  function choose(o: ComboOption) { onChange(o.id); setQuery(""); setOpen(false); }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true); setActiveIndex(0); e.preventDefault(); return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { setActiveIndex((i) => Math.min(i + 1, visible.length - 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setActiveIndex((i) => Math.max(i - 1, 0)); e.preventDefault(); }
    else if (e.key === "Enter") { if (visible[activeIndex]) choose(visible[activeIndex]); e.preventDefault(); }
    else if (e.key === "Escape") { setOpen(false); e.preventDefault(); }
  }

  return (
    <div className="relative">
      {/* Label geometry replicates the hubs' native fields exactly — an
          INLINE span (so it centers in the container's inherited line box
          the same way sibling labels do) with the field carrying mt-0.5.
          A block label with its own margin can never line up with those
          neighbors across contexts. */}
      <span className={hideLabel ? "sr-only" : "text-xs text-brand-muted"}>{label}</span>
      {selected && !open ? (
        <div className={`${hideLabel ? "" : "mt-0.5 "}flex items-center justify-between gap-2 rounded-md border border-brand-line bg-brand-surface px-2 py-1.5`}>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-brand-navy">{selected.label}</div>
            {selected.sublabel && <div className="truncate text-xs text-brand-muted">{selected.sublabel}</div>}
          </div>
          {!disabled && (
            <div className="flex shrink-0 items-center gap-2 text-xs">
              <button type="button" className="font-medium text-brand hover:underline"
                onClick={() => { setOpen(true); setQuery(""); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 0); }}>
                Change
              </button>
              <button type="button" className="text-brand-muted hover:underline" onClick={() => onChange(null)}>
                Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <input
          ref={inputRef} type="text" role="combobox"
          aria-expanded={open} aria-controls={listboxId} aria-autocomplete="list" aria-label={label}
          disabled={disabled} value={query} placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={`${hideLabel ? "" : "mt-0.5 "}block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:border-brand focus:outline-none`}
        />
      )}
      {help && <span className="mt-1 block text-xs text-brand-muted">{help}</span>}
      {open && !disabled && (
        <span aria-live="polite" className="sr-only">
          {filtered.length === 0 ? "No results" : `${filtered.length} results`}
        </span>
      )}
      {open && !disabled && (
        <ul id={listboxId} role="listbox" aria-label={`${label} options`}
          className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-md border border-brand-line bg-white p-1 shadow-lg dark:bg-zinc-900">
          {visible.length === 0 && (
            <li className="px-2 py-2 text-sm text-brand-muted">No matches for “{query}”.</li>
          )}
          {groups.map(([groupName, opts]) => (
            <li key={groupName || "_"}>
              {groupName && (
                <div className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                  {groupName}
                </div>
              )}
              <ul role="presentation">
                {opts.map((o) => {
                  const flatIndex = visible.indexOf(o);
                  const active = flatIndex === activeIndex;
                  return (
                    <li key={o.id} role="option" aria-selected={o.id === value}
                      className={`cursor-pointer rounded px-2 py-1.5 ${active ? "bg-brand-surface" : ""}`}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onMouseDown={(e) => { e.preventDefault(); choose(o); }}>
                      <div className="truncate text-sm text-brand-body">{o.label}</div>
                      {o.sublabel && <div className="truncate text-xs text-brand-muted">{o.sublabel}</div>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {overflow > 0 && (
            <li aria-disabled="true" className="px-2 py-1.5 text-xs text-brand-muted">
              {overflow} more — keep typing to narrow.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
