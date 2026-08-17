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
});
