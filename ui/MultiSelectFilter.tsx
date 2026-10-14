"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isSearchableSize, rankComboOptions } from "./combo-match";
import { inputClasses } from "./input-class";
import { multiSummary, toggleMulti } from "./multi-select";

// A list filter that takes several values (DESIGN-CONVENTIONS §3, "List
// filters take several values"; Project Hub 2027 plan list, 2026-10-14).
// Closed it reads like the native filter selects beside it ("All types", or
// what is picked); open it is a checkbox list with Clear and Done. Lists over
// the family's searchable threshold get a type-to-filter box, like
// AdaptiveSelect. Values in one filter are OR'd by the caller via
// `passesMulti`; separate filters AND. Escape or a click outside closes it.

export type MultiSelectOption = { id: string; label: string };

export function MultiSelectFilter({
  label,
  allLabel,
  noun,
  options,
  value,
  onChange,
  className = "",
}: {
  /** Accessible name, e.g. "Filter by type". */
  label: string;
  /** Closed text when nothing is picked, e.g. "All types". */
  allLabel: string;
  /** Plural noun for the count summary, e.g. "types" → "3 types". */
  noun: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const searchable = isSearchableSize(options.length);
  const summary = multiSummary(value, options, allLabel, noun);
  const shown = searchable ? rankComboOptions(options, query) : options;
  const order = options.map((o) => o.id);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    buttonRef.current?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${label}: ${summary}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${inputClasses("w-full")} flex items-center justify-between gap-2 text-left`}
        title={value.length > 1 ? value.map((id) => options.find((o) => o.id === id)?.label ?? id).join(", ") : undefined}
      >
        <span className={`truncate ${value.length ? "font-medium text-brand-navy dark:text-zinc-100" : ""}`}>{summary}</span>
        <span aria-hidden className="shrink-0 text-xs text-brand-muted">▾</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute left-0 z-30 mt-1 min-w-full w-max max-w-xs rounded-md border border-zinc-300 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {searchable && (
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              aria-label={`Search ${noun}`}
              className={`${inputClasses()} mb-2`}
            />
          )}
          <ul className="max-h-72 overflow-y-auto">
            {shown.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={value.includes(o.id)}
                    onChange={() => onChange(toggleMulti(value, o.id, order))}
                  />
                  <span>{o.label}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-1.5 py-1 text-sm text-brand-muted">No matches.</li>}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-200 pt-2 text-xs dark:border-zinc-700">
            <span className="text-brand-muted">{value.length ? `${value.length} selected` : "None selected = all"}</span>
            <span className="flex gap-3">
              {value.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="font-medium text-brand-navy hover:underline dark:text-zinc-200">
                  Clear
                </button>
              )}
              <button type="button" onClick={close} className="font-medium text-brand-navy hover:underline dark:text-zinc-200">
                Done
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
