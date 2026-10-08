import { describe, expect, it } from "vitest";
import { buttonClasses } from "../ui/Button";

describe("Button accent", () => {
  it("keeps dark ink in dark mode — the contrast rescue must not whiten it", () => {
    // theme.css remaps an unpaired text-zinc-900 to near-white under
    // [data-theme=dark]; a dark:text-* class is what opts an element out.
    const cls = buttonClasses({ variant: "accent" });
    expect(cls).toContain("text-zinc-900");
    expect(cls).toContain("dark:text-zinc-900");
  });
});
