// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShowMoreList } from "../ui/ShowMore";

afterEach(cleanup);

const items = Array.from({ length: 7 }, (_, i) => <div key={i}>Row {i + 1}</div>);

// UX audit 2026-10-21, FND-9: a pressed button that disappears hands focus on.
describe("ShowMore keeps keyboard focus", () => {
  it("Show all moves focus to Show fewer, and Show fewer back to Show more", async () => {
    render(<ShowMoreList items={items} initial={5} step={5} />);
    const all = screen.getByRole("button", { name: "Show all (7)" });
    all.focus();
    fireEvent.click(all);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show fewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show 2 more" }));
  });
});
