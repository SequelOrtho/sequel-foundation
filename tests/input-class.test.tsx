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
    expect(inputClasses(" w-32 text-right ")).toBe(`${INPUT_CLASS} w-32 text-right`);
  });
});
