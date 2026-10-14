// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { availableHeightBelow, horizontalNudge, VIEWPORT_GUTTER } from "../ui/viewport-fit";
import { useFitInViewport } from "../ui/useFitInViewport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("horizontalNudge", () => {
  it("leaves a panel that already fits alone", () => {
    expect(horizontalNudge(100, 300, 1024)).toBe(0);
  });

  it("moves a panel that runs off the left edge back to the gutter", () => {
    // The Project Hub defect: a right-anchored menu under the leftmost button.
    expect(horizontalNudge(-120, 56, 390)).toBe(120 + VIEWPORT_GUTTER);
  });

  it("moves a panel that runs off the right edge back inside it", () => {
    expect(horizontalNudge(900, 1100, 1024)).toBe(1024 - VIEWPORT_GUTTER - 1100);
  });

  it("pins a panel wider than the window to the left gutter", () => {
    expect(horizontalNudge(-50, 500, 320)).toBe(VIEWPORT_GUTTER + 50);
  });
});

describe("availableHeightBelow", () => {
  it("is the room between the panel top and the window bottom, less the gutter", () => {
    expect(availableHeightBelow(100, 800)).toBe(800 - 100 - VIEWPORT_GUTTER);
  });

  it("never drops below a usable floor", () => {
    expect(availableHeightBelow(780, 800)).toBe(160);
  });
});

function Menu() {
  const [open, setOpen] = useState(false);
  const ref = useFitInViewport<HTMLDivElement>(open);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        Toggle
      </button>
      {open && (
        <div ref={ref} data-testid="panel">
          Items
        </div>
      )}
    </div>
  );
}

function stubRect(rect: Partial<DOMRect>) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
}

describe("useFitInViewport", () => {
  it("slides an off-screen panel back inside the window and caps its width", () => {
    window.innerWidth = 390;
    window.innerHeight = 800;
    stubRect({ left: -120, right: 56, top: 60, height: 200 });
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    const panel = screen.getByTestId("panel");
    expect(panel.style.transform).toBe(`translateX(${120 + VIEWPORT_GUTTER}px)`);
    expect(panel.style.maxWidth).toBe(`calc(100vw - ${2 * VIEWPORT_GUTTER}px)`);
    expect(panel.style.maxHeight).toBe("");
  });

  it("caps a tall panel at the room below it and scrolls inside", () => {
    window.innerWidth = 1024;
    window.innerHeight = 600;
    stubRect({ left: 100, right: 300, top: 100, height: 900 });
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    const panel = screen.getByTestId("panel");
    expect(panel.style.transform).toBe("");
    expect(panel.style.maxHeight).toBe(`${600 - 100 - VIEWPORT_GUTTER}px`);
    expect(panel.style.overflowY).toBe("auto");
  });

  it("re-fits when the window is resized", () => {
    window.innerWidth = 1024;
    window.innerHeight = 800;
    stubRect({ left: 900, right: 1000, top: 60, height: 100 });
    render(<Menu />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    const panel = screen.getByTestId("panel");
    expect(panel.style.transform).toBe("");
    act(() => {
      window.innerWidth = 900;
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.transform).toBe(`translateX(${900 - VIEWPORT_GUTTER - 1000}px)`);
  });
});
