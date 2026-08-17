import { describe, expect, it } from "vitest";
import { usObservedHolidays, observedHolidaysInWindow } from "../holidays/index";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("usObservedHolidays", () => {
  it("returns the 7 company holidays", () => {
    expect(usObservedHolidays(2026).map((h) => h.name)).toEqual([
      "New Year's Day", "Memorial Day", "Independence Day", "Labor Day",
      "Thanksgiving Day", "Day after Thanksgiving", "Christmas Day",
    ]);
  });
  it("2026: July 4 is a Saturday, observed Friday July 3", () => {
    const july = usObservedHolidays(2026).find((h) => h.name === "Independence Day")!;
    expect(iso(july.actualDate)).toBe("2026-07-04");
    expect(iso(july.date)).toBe("2026-07-03");
  });
  it("2027: Christmas is a Saturday, observed Friday Dec 24", () => {
    const xmas = usObservedHolidays(2027).find((h) => h.name === "Christmas Day")!;
    expect(iso(xmas.date)).toBe("2027-12-24");
  });
  it("2028: New Year's Day is a Saturday, observed Friday Dec 31 2027", () => {
    const ny = usObservedHolidays(2028).find((h) => h.name === "New Year's Day")!;
    expect(iso(ny.date)).toBe("2027-12-31");
  });
  it("2034: New Year's Day is a Sunday, observed Monday Jan 2", () => {
    const ny = usObservedHolidays(2034).find((h) => h.name === "New Year's Day")!;
    expect(iso(ny.date)).toBe("2034-01-02");
  });
  it("floating holidays: 2026 Memorial May 25, Labor Sep 7, Thanksgiving Nov 26 + day after Nov 27", () => {
    const byName = Object.fromEntries(usObservedHolidays(2026).map((h) => [h.name, iso(h.date)]));
    expect(byName["Memorial Day"]).toBe("2026-05-25");
    expect(byName["Labor Day"]).toBe("2026-09-07");
    expect(byName["Thanksgiving Day"]).toBe("2026-11-26");
    expect(byName["Day after Thanksgiving"]).toBe("2026-11-27");
  });
});

describe("observedHolidaysInWindow", () => {
  it("catches a prior-year-observed New Year's (Dec 31 2027 for NY 2028)", () => {
    const got = observedHolidaysInWindow(new Date(2027, 11, 27), new Date(2028, 0, 2));
    expect(got.map((h) => iso(h.date))).toEqual(["2027-12-31"]);
  });
  it("excludes observed dates outside the window", () => {
    const got = observedHolidaysInWindow(new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(got).toEqual([]);
  });
  it("multi-year window returns both years' holidays sorted", () => {
    const got = observedHolidaysInWindow(new Date(2026, 10, 1), new Date(2027, 0, 31));
    expect(got.map((h) => h.name)).toEqual([
      "Thanksgiving Day", "Day after Thanksgiving", "Christmas Day", "New Year's Day",
    ]);
  });
});
