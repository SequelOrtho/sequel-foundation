// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdaptiveSelect } from "../ui/AdaptiveSelect";

afterEach(cleanup);

const few = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, label: `Option ${i + 1}` }));
const many = Array.from({ length: 13 }, (_, i) => ({ id: i + 1, label: `Person ${i + 1}` }));

describe("AdaptiveSelect", () => {
  it("renders a native <select> for 12 or fewer options", () => {
    const onChange = vi.fn();
    render(<AdaptiveSelect options={few} value={null} onChange={onChange} label="Status" name="status" />);
    const select = screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.name).toBe("status");
    fireEvent.change(select, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3); // id type preserved (number, not "3")
  });
  it("renders the fuzzy SearchCombobox past 12 options, with a hidden form input", () => {
    const onChange = vi.fn();
    const { container } = render(
      <AdaptiveSelect options={many} value={null} onChange={onChange} label="Owner" name="owner" />,
    );
    const input = screen.getByRole("combobox", { name: "Owner" }) as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    fireEvent.change(input, { target: { value: "persn 13" } }); // typo-tolerant
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(13);
    const hidden = container.querySelector('input[type="hidden"][name="owner"]') as HTMLInputElement;
    expect(hidden).toBeTruthy();
  });
  it("hidden form input carries the selected id in searchable mode", () => {
    const { container } = render(<AdaptiveSelect options={many} value={7} label="Owner" name="owner" />);
    const hidden = container.querySelector('input[type="hidden"][name="owner"]') as HTMLInputElement;
    expect(hidden.value).toBe("7");
    expect(screen.getByText("Person 7")).toBeTruthy();
  });
  it("works uncontrolled via defaultValue in both modes", () => {
    const { container, unmount } = render(<AdaptiveSelect options={few} defaultValue={2} label="Status" name="s" />);
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("2");
    fireEvent.change(select, { target: { value: "5" } });
    expect(select.value).toBe("5");
    unmount();
    const r2 = render(<AdaptiveSelect options={many} defaultValue={4} label="Owner" name="o" />);
    expect((r2.container.querySelector('input[name="o"]') as HTMLInputElement).value).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect((r2.container.querySelector('input[name="o"]') as HTMLInputElement).value).toBe("");
  });
  it("honors an explicit threshold override and clearable=false", () => {
    render(
      <AdaptiveSelect options={few} value={1} label="Site" searchableThreshold={5} clearable={false} required />,
    );
    // Searchable rendering with a value shows the summary card (Change, no Clear).
    expect(screen.getByText("Option 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull(); // no native <select> for 12 items at threshold 5
  });
  it("native mode groups options into <optgroup>s", () => {
    const grouped = [
      { id: "a", label: "Alpha", group: "Active" },
      { id: "b", label: "Beta", group: "Active" },
      { id: "c", label: "Gamma", group: "Retired" },
    ];
    const { container } = render(<AdaptiveSelect options={grouped} value={null} label="Site" />);
    expect(container.querySelectorAll("optgroup")).toHaveLength(2);
    expect(container.querySelectorAll("option")).toHaveLength(4); // 3 + placeholder
  });
});
