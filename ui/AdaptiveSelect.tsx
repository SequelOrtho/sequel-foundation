"use client";

import { useId, useState } from "react";
import { isSearchableSize, type ComboOption } from "./combo-match";
import { SearchCombobox } from "./SearchCombobox";

// The one dropdown control (DESIGN-CONVENTIONS §3, "Dropdowns over 12 items
// are searchable"). Hand it the options and it renders a native <select> while
// the list is 12 or fewer, and the fuzzy SearchCombobox once it grows past 12 —
// so a people/project/entity picker that is small in one tenant and huge in
// another obeys the rule in both without a code change. Both renderings share
// the same props, the same `name` for form posts, and the same onChange
// contract (the option's id, or null when cleared).
//
// Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`, read via
// `name` on submit) — like a native <select>.

export type AdaptiveSelectProps = {
  options: ComboOption[];
  /** Controlled selected id. Omit (with defaultValue) for uncontrolled use. */
  value?: number | string | null;
  defaultValue?: number | string | null;
  onChange?: (id: number | string | null) => void;
  label: string;
  /** Visually hide the label (still read to screen readers). */
  hideLabel?: boolean;
  /** Native placeholder option text / combobox input placeholder. */
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** Form field name — posted like a native <select>. */
  name?: string;
  id?: string;
  help?: string;
  /** Allow returning to "nothing selected". Defaults to true. */
  clearable?: boolean;
  /** Extra classes for the native <select> element (dense rows, widths). */
  selectClassName?: string;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Override the family threshold (12) for a specific surface. */
  searchableThreshold?: number;
  maxVisible?: number;
  /** Sort groups/options as given; the native rendering honors `group` via <optgroup>. */
};

const NATIVE_SELECT_CLASS =
  "block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-transparent px-2 py-1.5 text-sm focus:border-brand focus:outline-none disabled:opacity-60";

function idOf(options: ComboOption[], raw: string): number | string | null {
  if (raw === "") return null;
  const hit = options.find((o) => String(o.id) === raw);
  return hit ? hit.id : raw;
}

export function AdaptiveSelect({
  options,
  value,
  defaultValue = null,
  onChange,
  label,
  hideLabel = false,
  placeholder,
  disabled = false,
  required = false,
  name,
  id,
  help,
  clearable = true,
  selectClassName = "",
  className = "",
  searchableThreshold,
  maxVisible,
}: AdaptiveSelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const controlled = value !== undefined;
  const [inner, setInner] = useState<number | string | null>(defaultValue);
  const current = controlled ? (value ?? null) : inner;

  function commit(next: number | string | null) {
    if (!controlled) setInner(next);
    onChange?.(next);
  }

  const searchable =
    searchableThreshold == null ? isSearchableSize(options.length) : options.length > searchableThreshold;

  if (searchable) {
    return (
      <SearchCombobox
        options={options}
        value={current}
        onChange={commit}
        label={label}
        hideLabel={hideLabel}
        placeholder={placeholder ?? "Type to search…"}
        disabled={disabled}
        required={required}
        name={name}
        help={help}
        clearable={clearable}
        className={className}
        maxVisible={maxVisible}
      />
    );
  }

  // Native rendering. Group headers become <optgroup>s in first-appearance order.
  const grouped = options.some((o) => o.group);
  const renderOption = (o: ComboOption) => (
    <option key={o.id} value={String(o.id)}>
      {o.sublabel ? `${o.label} — ${o.sublabel}` : o.label}
    </option>
  );
  let body: React.ReactNode;
  if (grouped) {
    const byGroup = new Map<string, ComboOption[]>();
    for (const o of options) byGroup.set(o.group ?? "", [...(byGroup.get(o.group ?? "") ?? []), o]);
    body = [...byGroup.entries()].map(([g, opts]) =>
      g ? (
        <optgroup key={g} label={g}>
          {opts.map(renderOption)}
        </optgroup>
      ) : (
        opts.map(renderOption)
      ),
    );
  } else {
    body = options.map(renderOption);
  }

  // A placeholder row is shown whenever the field can be empty (or is empty
  // now); it is disabled for required fields so users can't re-pick "nothing".
  const showPlaceholder = clearable || current == null || placeholder != null;

  return (
    <div className={className}>
      <label htmlFor={selectId} className={hideLabel ? "sr-only" : "text-xs text-brand-muted"}>
        {label}
        {required && !hideLabel && (
          <span className="text-brand-danger" aria-hidden>
            {" *"}
          </span>
        )}
      </label>
      <select
        id={selectId}
        name={name}
        value={current == null ? "" : String(current)}
        onChange={(e) => commit(idOf(options, e.target.value))}
        disabled={disabled}
        required={required}
        className={`${hideLabel ? "" : "mt-0.5 "}${NATIVE_SELECT_CLASS} ${selectClassName}`.trim()}
      >
        {showPlaceholder && (
          <option value="" disabled={required && !clearable}>
            {placeholder ?? "— Select —"}
          </option>
        )}
        {body}
      </select>
      {help && <span className="mt-1 block text-xs text-brand-muted">{help}</span>}
    </div>
  );
}
