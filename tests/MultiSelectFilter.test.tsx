// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MultiSelectFilter } from "../ui/MultiSelectFilter";

afterEach(cleanup);

const types = [
  { id: "Sprint", label: "Sprint" },
  { id: "JDI", label: "JDI" },
  { id: "MGP", label: "MGP" },
];

function Harness({ options = types }: { options?: { id: string; label: string }[] }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <MultiSelectFilter label="Filter by type" allLabel="All types" noun="types" options={options} value={value} onChange={setValue} />
      <output data-testid="value">{value.join("|")}</output>
    </>
  );
}

const button = () => screen.getByRole("button", { name: /^Filter by type:/ });

describe("MultiSelectFilter", () => {
  it("reads 'All' closed, ticks several values, and clears", () => {
    render(<Harness />);
    expect(button().getAttribute("aria-label")).toBe("Filter by type: All types");
    fireEvent.click(button());
    const panel = screen.getByRole("group", { name: "Filter by type" });
    fireEvent.click(within(panel).getByLabelText("MGP"));
    fireEvent.click(within(panel).getByLabelText("Sprint"));
    expect(screen.getByTestId("value").textContent).toBe("Sprint|MGP");
    expect(button().getAttribute("aria-label")).toBe("Filter by type: Sprint, MGP");
    fireEvent.click(within(panel).getByRole("button", { name: "Clear" }));
    expect(screen.getByTestId("value").textContent).toBe("");
  });

  it("closes on Escape and returns focus to the button", () => {
    render(<Harness />);
    fireEvent.click(button());
    expect(button().getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(screen.getByRole("group", { name: "Filter by type" }), { key: "Escape" });
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button());
  });

  it("adds a type-to-filter box past the searchable threshold", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `p${i}`, label: `Person ${i}` }));
    render(<Harness options={many} />);
    fireEvent.click(button());
    fireEvent.change(screen.getByRole("searchbox", { name: "Search types" }), { target: { value: "Person 12" } });
    const panel = screen.getByRole("group", { name: "Filter by type" });
    expect(within(panel).getAllByRole("checkbox")[0].parentElement?.textContent).toBe("Person 12");
  });
});
