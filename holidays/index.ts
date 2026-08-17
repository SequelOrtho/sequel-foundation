// US observed company holidays — pure, no Date.now(). Local-midnight Dates.
// Observed rules: fixed-date holidays shift Sat → preceding Friday and
// Sun → following Monday; floating (Monday/Thursday-anchored) holidays never shift.

export type ObservedHoliday = {
  name: string;
  /** Observed date — the day capacity is reduced. */
  date: Date;
  /** Calendar date of the holiday itself. */
  actualDate: Date;
};

const at = (y: number, m: number, d: number) => new Date(y, m, d);

function observedDate(actual: Date): Date {
  const dow = actual.getDay();
  if (dow === 6) return at(actual.getFullYear(), actual.getMonth(), actual.getDate() - 1);
  if (dow === 0) return at(actual.getFullYear(), actual.getMonth(), actual.getDate() + 1);
  return actual;
}

/** n-th (1-based) weekday `dow` (0=Sun..6=Sat) of the month. */
function nthWeekday(year: number, month: number, dow: number, n: number): Date {
  const first = at(year, month, 1);
  const offset = (dow - first.getDay() + 7) % 7;
  return at(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, dow: number): Date {
  const last = at(year, month + 1, 0);
  const offset = (last.getDay() - dow + 7) % 7;
  return at(year, month, last.getDate() - offset);
}

export function usObservedHolidays(year: number): ObservedHoliday[] {
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const fixed = (name: string, actual: Date): ObservedHoliday => ({
    name, actualDate: actual, date: observedDate(actual),
  });
  const floating = (name: string, actual: Date): ObservedHoliday => ({
    name, actualDate: actual, date: actual,
  });
  return [
    fixed("New Year's Day", at(year, 0, 1)),
    floating("Memorial Day", lastWeekday(year, 4, 1)),
    fixed("Independence Day", at(year, 6, 4)),
    floating("Labor Day", nthWeekday(year, 8, 1, 1)),
    floating("Thanksgiving Day", thanksgiving),
    floating("Day after Thanksgiving", at(year, 10, thanksgiving.getDate() + 1)),
    fixed("Christmas Day", at(year, 11, 25)),
  ];
}

/**
 * Observed holidays whose observed date falls in [start, end] inclusive.
 * Queries year-1..year+1 around the window so cross-year observations
 * (New Year's observed Dec 31) are caught. Sorted by observed date.
 */
export function observedHolidaysInWindow(start: Date, end: Date): ObservedHoliday[] {
  const s = at(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = at(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const out: ObservedHoliday[] = [];
  for (let y = start.getFullYear() - 1; y <= end.getFullYear() + 1; y++) {
    for (const h of usObservedHolidays(y)) {
      const t = h.date.getTime();
      if (t >= s && t <= e) out.push(h);
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
