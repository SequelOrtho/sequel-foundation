// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovedBadge } from "../ui/StatusBadges";
import { SaveStateIndicator } from "../ui/SaveState";
import { ShowMoreControls } from "../ui/ShowMore";
import { TAB_COUNT_CLASS } from "../ui/tabs";

vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown }) => <a href={p.href}>{p.children as never}</a> }));
afterEach(() => cleanup());

// The 390px sweep of the foundation's own components (v0.30.0, DESIGN-
// CONVENTIONS §3 "Tags in table cells"): a tag or chip never breaks inside
// itself, and a row of text buttons wraps as whole buttons.
const tokens = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("chips keep their label on one line", () => {
  it("ApprovedBadge", () => {
    const { container } = render(<ApprovedBadge approvedAt="2026-10-21T12:00:00Z" />);
    expect(tokens(container.firstElementChild)).toContain("whitespace-nowrap");
  });

  it.each([
    ["Saving…", { saving: true, savedAt: null }],
    ["Unsaved changes", { saving: false, dirty: true, savedAt: null }],
    ["Saved", { saving: false, savedAt: Date.UTC(2026, 9, 21, 14, 14) }],
  ] as const)("SaveStateIndicator — %s", (_, props) => {
    const { container } = render(<SaveStateIndicator {...props} />);
    expect(tokens(container.firstElementChild?.firstElementChild ?? null)).toContain("whitespace-nowrap");
  });

  it("a tab's count pill", () => {
    expect(TAB_COUNT_CLASS.split(" ")).toContain("whitespace-nowrap");
  });
});

describe("ShowMoreControls wraps as whole buttons", () => {
  it("the button row wraps and each label stays on one line", async () => {
    const { SignedInNotice } = await import("../session/SignedInNotice");
    const noop = () => {};
    const { container } = render(
      <ShowMoreControls remaining={10} total={20} expanded step={5} showMore={noop} showAll={noop} collapse={noop} />,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(tokens(b)).toContain("whitespace-nowrap");
    expect(tokens(buttons[0].parentElement)).toContain("flex-wrap");
    const html = renderToStaticMarkup(<SignedInNotice appName="Hub" email="a@example.com" continueHref="/" />);
    expect(html).toMatch(/class="mt-8 flex flex-wrap items-center justify-center gap-3"/);
  });
});

describe("Sign Out never wraps", () => {
  it("the default Sign Out button keeps its label on one line", async () => {
    const { SignOutForm } = await import("../session/SignOutForm");
    const html = renderToStaticMarkup(<SignOutForm>a.very.long.address@example.com</SignOutForm>);
    const cls = html.match(/<button[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(cls.split(/\s+/)).toContain("whitespace-nowrap");
  });
});
