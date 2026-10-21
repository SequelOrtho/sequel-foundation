// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchCombobox } from "../ui/SearchCombobox";

afterEach(cleanup);

const options = [
  { id: 1, label: "Nguyen, Amy", keywords: "Amy Nguyen" },
  { id: 2, label: "Smith, Bob", keywords: "Bob Smith" },
  { id: 3, label: "Zed", keywords: "Zed" },
];

describe("SearchCombobox", () => {
  it("filters as the user types and selects on click", () => {
    const onChange = vi.fn();
    render(<SearchCombobox options={options} value={null} onChange={onChange} label="Resource" />);
    const input = screen.getByRole("combobox", { name: "Resource" });
    fireEvent.change(input, { target: { value: "amy" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.mouseDown(screen.getByRole("option", { name: /Nguyen, Amy/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
  it("Enter selects the active option", () => {
    const onChange = vi.fn();
    render(<SearchCombobox options={options} value={null} onChange={onChange} label="Resource" />);
    const input = screen.getByRole("combobox", { name: "Resource" });
    fireEvent.change(input, { target: { value: "smith" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(2);
  });
  it("hideLabel keeps the label for screen readers only", () => {
    render(
      <SearchCombobox options={options} value={null} onChange={() => {}} label="Sponsor" hideLabel />,
    );
    // Still reachable by accessible name…
    expect(screen.getByRole("combobox", { name: "Sponsor" })).toBeTruthy();
    // …but the visible label span is sr-only.
    expect(screen.getByText("Sponsor").className).toContain("sr-only");
  });
  it("caps rendering at maxVisible with an overflow hint", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: i, label: `Person ${i}` }));
    render(<SearchCombobox options={many} value={null} onChange={() => {}} label="Resource" maxVisible={50} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Resource" }));
    expect(screen.getAllByRole("option")).toHaveLength(50);
    expect(screen.getByText(/10 more — keep typing/)).toBeTruthy();
  });
  it("shows a selected summary card with Change/Clear", () => {
    const onChange = vi.fn();
    render(<SearchCombobox options={options} value={2} onChange={onChange} label="Resource" />);
    expect(screen.getByText("Smith, Bob")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
  // UX audit 2026-10-21, FND-3 / FND-4.
  it("tells screen readers which option the arrow keys are on", () => {
    render(<SearchCombobox options={options} value={null} onChange={() => {}} label="Resource" />);
    const input = screen.getByRole("combobox", { name: "Resource" });
    fireEvent.focus(input);
    const first = input.getAttribute("aria-activedescendant");
    expect(first).toBeTruthy();
    expect(document.getElementById(first!)?.textContent).toContain("Nguyen, Amy");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const second = input.getAttribute("aria-activedescendant")!;
    expect(document.getElementById(second)?.getAttribute("role")).toBe("option");
    expect(document.getElementById(second)?.textContent).toContain("Smith, Bob");
    expect(document.getElementById(second)?.getAttribute("data-active")).toBe("true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });
  it("marks the chosen option with a check and aria-selected", () => {
    render(<SearchCombobox options={options} value={2} onChange={() => {}} label="Resource" />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const chosen = screen.getByRole("option", { name: /Smith, Bob/ });
    expect(chosen.getAttribute("aria-selected")).toBe("true");
    expect(chosen.textContent).toContain("✓");
    expect(screen.getByRole("option", { name: /Zed/ }).textContent).not.toContain("✓");
  });
});
