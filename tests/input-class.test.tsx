// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdaptiveSelect } from "../ui/AdaptiveSelect";
import { INPUT_CLASS, inputClasses } from "../ui/input-class";

afterEach(cleanup);

const few = [{ id: 1, label: "One" }, { id: 2, label: "Two" }];
const many = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, label: `Person ${i + 1}` }));

// The whole point of INPUT_CLASS: a hand-rolled input on a tinted card must not
// take the card's tint while the foundation pickers beside it stay white.
describe("INPUT_CLASS", () => {
  it("paints an explicit light ground and stays transparent in dark mode", () => {
    const tokens = INPUT_CLASS.split(" ");
    expect(tokens).toContain("bg-white");
    expect(tokens).toContain("dark:bg-transparent");
  });

  it("is the exact box both picker renderings use", () => {
    render(<AdaptiveSelect options={few} value={null} label="Status" />);
    const select = screen.getByRole("combobox", { name: "Status" });
    for (const t of INPUT_CLASS.split(" ")) expect(select.classList).toContain(t);
    cleanup();
    render(<AdaptiveSelect options={many} value={null} label="Owner" />);
    const combo = screen.getByRole("combobox", { name: "Owner" });
    for (const t of INPUT_CLASS.split(" ")) expect(combo.classList).toContain(t);
  });
});

describe("inputClasses", () => {
  it("returns the base alone when no extras are given", () => {
    expect(inputClasses()).toBe(INPUT_CLASS);
    expect(inputClasses("  ")).toBe(INPUT_CLASS);
  });
  it("appends call-site extras after the base", () => {
    expect(inputClasses(" max-w-xs text-right ")).toBe(`${INPUT_CLASS} max-w-xs text-right`);
  });
  // Tailwind v4 emits .w-full after .w-32, so a plain width extra would lose.
  it("drops the base w-full when the extras set an unprefixed width", () => {
    const cls = inputClasses("w-32 text-right").split(" ");
    expect(cls).toContain("w-32");
    expect(cls).not.toContain("w-full");
  });
  it("keeps w-full for max-w-*, min-w-*, and responsive widths", () => {
    for (const extra of ["max-w-xs", "min-w-40", "sm:w-48"]) {
      expect(inputClasses(extra).split(" ")).toContain("w-full");
    }
  });
});
