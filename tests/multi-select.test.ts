import { describe, it, expect } from "vitest";
import { multiSummary, passesMulti, toggleMulti } from "../ui/multi-select";

const opts = [
  { id: "Sprint", label: "Sprint (DMAIC)" },
  { id: "JDI", label: "JDI" },
  { id: "MGP", label: "MGP" },
];

describe("passesMulti", () => {
  it("is off when nothing is picked", () => {
    expect(passesMulti([], "Sprint")).toBe(true);
    expect(passesMulti([], null)).toBe(true);
  });
  it("passes any picked value (OR within a filter)", () => {
    expect(passesMulti(["Sprint", "MGP"], "MGP")).toBe(true);
    expect(passesMulti(["Sprint", "MGP"], "JDI")).toBe(false);
  });
  it("never passes a blank value once something is picked", () => {
    expect(passesMulti(["Sprint"], null)).toBe(false);
    expect(passesMulti(["Sprint"], undefined)).toBe(false);
  });
});

describe("toggleMulti", () => {
  it("adds and removes, keeping the options' order", () => {
    const order = opts.map((o) => o.id);
    expect(toggleMulti(["MGP"], "Sprint", order)).toEqual(["Sprint", "MGP"]);
    expect(toggleMulti(["Sprint", "MGP"], "Sprint", order)).toEqual(["MGP"]);
  });
});

describe("multiSummary", () => {
  it("reads like the native select it replaces", () => {
    expect(multiSummary([], opts, "All types", "types")).toBe("All types");
    expect(multiSummary(["Sprint"], opts, "All types", "types")).toBe("Sprint (DMAIC)");
    expect(multiSummary(["Sprint", "MGP"], opts, "All types", "types")).toBe("Sprint (DMAIC), MGP");
    expect(multiSummary(["Sprint", "JDI", "MGP"], opts, "All types", "types")).toBe("3 types");
  });
});
