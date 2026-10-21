"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { rankComboOptions, type ComboOption } from "./combo-match";
import { FieldError, RequiredMark } from "./Field";
import { INPUT_CLASS } from "./input-class";
import { useFitInViewport } from "./useFitInViewport";

// Searchable single-select combobox (W3C APG editable-combobox-with-list
// pattern). Built for option lists that outgrew a flat <select>: type-to-filter
// with fuzzy, ranked token-AND matching (prefix > substring > subsequence >
// one-typo — see combo-match.ts), full list browsable on focus, optional group
// headers, capped render with a "keep typing" hint, live result count.
// Family rule (DESIGN-CONVENTIONS §3): any dropdown over 12 choices renders as
// this control — AdaptiveSelect picks native vs. searchable for you.
//
// Screen readers follow the arrow keys through aria-activedescendant (focus
// stays in the input; each option has an id). The active row is a visible
// ring, the chosen option carries a check mark, and both survive Windows High
// Contrast (UX audit 2026-10-21, FND-3 / FND-4).

const BORDER = "border border-zinc-300 dark:border-zinc-700";
const optionId = (listboxId: string, index: number) => `${listboxId}-opt-${index}`;

export function SearchCombobox({
  options, value, onChange, label,
  placeholder = "Type to search…", disabled = false, help, maxVisible = 50,
  hideLabel = false, name, clearable = true, required = false, className = "",
  labelClassName, error,
}: {
  options: ComboOption[]; value: number | string | null;
  onChange: (id: number | string | null) => void;
  label: string; placeholder?: string; disabled?: boolean;
  help?: string; maxVisible?: number;
  // Render the label for screen readers only — for filter bars whose sibling
  // controls are unlabeled, where a visible label breaks row alignment.
  hideLabel?: boolean;
  // Form-post support: when set, a hidden <input name> carries the selected id
  // (empty string when nothing is selected) so server actions / uncontrolled
  // <form> submits read it like a native <select>.
  name?: string;
  // Hide the Clear affordance for fields that must always hold a value.
  clearable?: boolean;
  // Marks the hidden form input required (native validity) and the label.
  required?: boolean;
  // Extra classes on the outer wrapper (e.g. min-w-* in a filter row).
  className?: string;
  // Replaces the default visible-label classes (`text-xs text-brand-muted`)
  // so a host form with its own label typography (uppercase, navy, …) can
  // keep converted fields visually consistent. Ignored when hideLabel is set.
  labelClassName?: string;
  // Save-time validation message under the control (role="alert"); marks the
  // input aria-invalid.
  error?: string;
}) {
  const listboxId = useId();
  const errorId = `${listboxId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  // The list is min 16rem wide, so a narrow field near the window edge would
  // otherwise open past it.
  const listRef = useFitInViewport<HTMLUListElement>(open && !disabled);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = value != null ? (options.find((o) => o.id === value) ?? null) : null;
  const filtered = useMemo(() => rankComboOptions(options, query), [options, query]);
  const visible = filtered.slice(0, maxVisible);
  const overflow = filtered.length - visible.length;

  // Group only when any option declares a group; render order follows options.
  const groups = useMemo(() => {
    const byGroup = new Map<string, ComboOption[]>();
    for (const o of visible) byGroup.set(o.group ?? "", [...(byGroup.get(o.group ?? "") ?? []), o]);
    return [...byGroup.entries()];
  }, [visible]);

  const activeId = open && !disabled && visible[activeIndex] ? optionId(listboxId, activeIndex) : undefined;
  // Keep the active row in view as the arrow keys move past the list's edge.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeId]);

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
    <div className={`relative ${className}`.trim()}>
      {name != null && (
        <input type="hidden" name={name} value={value == null ? "" : String(value)} required={required} />
      )}
      {/* Label geometry replicates the hubs' native fields exactly — an
          INLINE span (so it centers in the container's inherited line box
          the same way sibling labels do) with the field carrying mt-0.5.
          A block label with its own margin can never line up with those
          neighbors across contexts. */}
      <span className={hideLabel ? "sr-only" : (labelClassName ?? "text-xs text-brand-muted")}>
        {label}
        {required && !hideLabel && <RequiredMark />}
      </span>
      {selected && !open ? (
        <div className={`${hideLabel ? "" : "mt-0.5 "}flex items-center justify-between gap-2 rounded-md ${BORDER} bg-brand-surface px-2 py-1.5`}>
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
              {clearable && (
                <button type="button" className="text-brand-muted hover:underline" onClick={() => onChange(null)}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <input
          ref={inputRef} type="text" role="combobox"
          aria-expanded={open} aria-controls={listboxId} aria-autocomplete="list" aria-label={label}
          aria-activedescendant={activeId}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled} value={query} placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={`${hideLabel ? "" : "mt-0.5 "}${INPUT_CLASS}`}
        />
      )}
      {help && <span className="mt-1 block text-xs text-brand-muted">{help}</span>}
      {error && <FieldError id={errorId} className="mt-1 block">{error}</FieldError>}
      {open && !disabled && (
        <span aria-live="polite" className="sr-only">
          {filtered.length === 0 ? "No results" : `${filtered.length} results`}
        </span>
      )}
      {open && !disabled && (
        <ul ref={listRef} id={listboxId} role="listbox" aria-label={`${label} options`}
          className="absolute z-20 mt-1 max-h-72 w-full min-w-[16rem] overflow-y-auto rounded-md ${BORDER} bg-white p-1 shadow-lg dark:bg-zinc-900">
          {visible.length === 0 && (
            <li className="px-2 py-2 text-sm text-brand-muted">No matches for “{query}”.</li>
          )}
          {groups.map(([groupName, opts], gi) => (
            <li key={groupName || "_"} role={groupName ? "group" : "presentation"}
              aria-labelledby={groupName ? `${listboxId}-group-${gi}` : undefined}>
              {groupName && (
                <div id={`${listboxId}-group-${gi}`} role="presentation"
                  className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
                  {groupName}
                </div>
              )}
              <ul role="presentation">
                {opts.map((o) => {
                  const flatIndex = visible.indexOf(o);
                  const active = flatIndex === activeIndex;
                  const chosen = o.id === value;
                  return (
                    <li key={o.id} id={optionId(listboxId, flatIndex)} role="option" aria-selected={chosen}
                      data-active={active || undefined}
                      className={`flex cursor-pointer items-start gap-1.5 rounded px-2 py-1.5 ${
                        active
                          ? "bg-blue-50 ring-2 ring-inset ring-brand dark:bg-zinc-800 forced-colors:outline forced-colors:outline-2 forced-colors:outline-[Highlight]"
                          : ""
                      }`}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onMouseDown={(e) => { e.preventDefault(); choose(o); }}>
                      <span aria-hidden className="w-4 shrink-0 text-sm text-brand">{chosen ? "✓" : ""}</span>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm text-zinc-900 dark:text-zinc-100 ${chosen ? "font-semibold" : ""}`}>{o.label}</span>
                        {o.sublabel && <span className="block truncate text-xs text-brand-muted">{o.sublabel}</span>}
                      </span>
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
