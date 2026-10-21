// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartTheme } from "../brand/chart-theme";
import { ENTITY_KEYS } from "../brand/entities";
import { ThemeToggle } from "../theme/ThemeToggle";
import { Button, Dialog, RygStatus, SkipLink, titleTemplate, useConfirmStep, MAIN_CONTENT_ID } from "../ui";

afterEach(cleanup);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("SkipLink and the title template (FND-15)", () => {
  it("links to the main landmark id", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to main content" }).getAttribute("href")).toBe(`#${MAIN_CONTENT_ID}`);
  });
  it("titles pages 'Page · App' and the app alone by default", () => {
    expect(titleTemplate("Sequel Scheduler Hub")).toEqual({ default: "Sequel Scheduler Hub", template: "%s · Sequel Scheduler Hub" });
  });
});

describe("ThemeToggle compact (FND-17)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps the mode in its name while the word hides on phones", () => {
    render(<ThemeToggle storageKey="t.theme" />);
    const b = screen.getByRole("button", { name: /Theme: Browser/ });
    expect(b.querySelector(".sm\\:not-sr-only")?.textContent).toBe("Browser");
  });
  it("can always show the word", () => {
    render(<ThemeToggle storageKey="t.theme" compact={false} />);
    expect(screen.getByRole("button").querySelector(".sr-only")).toBeNull();
  });
});

function DialogHost({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open Picker</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Choose a playbook"
        description="Pick one to open."
        footer={<button onClick={() => setOpen(false)}>Cancel</button>}
      >
        <p>Body</p>
      </Dialog>
    </>
  );
}

describe("Dialog (FND-18)", () => {
  it("is a named dialog with a labelled close button, and gives focus back on close", () => {
    const onClose = vi.fn();
    render(<DialogHost onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open Picker" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Choose a playbook");
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe("Pick one to open.");
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("closes on Escape (the native cancel event) and on a backdrop click", () => {
    const onClose = vi.fn();
    render(<DialogHost onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Picker" }));
    fireEvent(document.querySelector("dialog")!, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Open Picker" }));
    fireEvent.click(document.querySelector("dialog")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

// The foundation Button takes the refs (React 19 passes ref as a prop).
function ConfirmHost() {
  const step = useConfirmStep();
  return step.armed ? (
    <>
      <Button ref={step.confirmRef}>Confirm Approve</Button>
      <Button onClick={step.cancel}>Cancel</Button>
    </>
  ) : (
    <Button ref={step.armRef} onClick={step.arm}>
      Approve
    </Button>
  );
}

describe("useConfirmStep (FND-21)", () => {
  it("moves focus to Confirm on arm and back to the arming button on Cancel or Escape", () => {
    render(<ConfirmHost />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Approve" }));
  });
  it("does not grab focus on first render", () => {
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();
    render(<ConfirmHost />);
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe("RygStatus (FND-20)", () => {
  it("pairs a distinct glyph with a word for every level", () => {
    const { container } = render(
      <>
        <RygStatus level="green" />
        <RygStatus level="yellow" />
        <RygStatus level="red" label="Overdue" />
        <RygStatus level="none" />
      </>,
    );
    expect(screen.getByText("On track")).toBeTruthy();
    expect(screen.getByText("At risk")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Not reported")).toBeTruthy();
    const glyphs = [...container.querySelectorAll("[data-ryg] > span[aria-hidden]")].map((g) => g.textContent);
    expect(new Set(glyphs).size).toBe(4);
  });
});

describe("chartTheme (FND-19)", () => {
  it("keeps tooltip text and axis ticks readable in both themes for every entity", () => {
    for (const entity of ENTITY_KEYS) {
      for (const theme of ["light", "dark"] as const) {
        const t = chartTheme(theme, entity);
        const card = t.tooltip.contentStyle.backgroundColor as string;
        expect(contrast(t.tooltip.contentStyle.color as string, card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.axisTick.fill, card)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.legend.color as string, card)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
