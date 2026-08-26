// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HOME_TOAST_MESSAGE, HomeLink, toastHomeNav } from "../ui/HomeLink";
import { clearAllToasts, getToasts } from "../ui/toast/store";

afterEach(() => {
  cleanup();
  clearAllToasts();
  window.history.pushState({}, "", "/");
});

describe("toastHomeNav", () => {
  it("fires the standard info toast", () => {
    const id = toastHomeNav();
    const t = getToasts().find((x) => x.id === id);
    expect(t?.message).toBe(HOME_TOAST_MESSAGE);
    expect(t?.message).toContain("Bringing you back to Home");
    expect(t?.tone).toBe("info");
  });
});

describe("HomeLink", () => {
  it("toasts on a plain click away from a non-home page", () => {
    window.history.pushState({}, "", "/projects/925");
    render(
      <HomeLink ariaLabel="Sequel Ortho — Home">
        <span>Project Hub</span>
      </HomeLink>,
    );
    fireEvent.click(screen.getByRole("link", { name: "Sequel Ortho — Home" }));
    expect(getToasts().map((t) => t.message)).toEqual([HOME_TOAST_MESSAGE]);
  });

  it("stays silent when already on Home", () => {
    render(<HomeLink>Hub</HomeLink>);
    fireEvent.click(screen.getByRole("link", { name: "Hub" }));
    expect(getToasts()).toHaveLength(0);
  });

  it("stays silent on modified clicks (new tab — the view never leaves)", () => {
    window.history.pushState({}, "", "/vcp");
    render(<HomeLink>Hub</HomeLink>);
    const link = screen.getByRole("link", { name: "Hub" });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { ctrlKey: true });
    expect(getToasts()).toHaveLength(0);
  });

  it("honors a per-app message override", () => {
    window.history.pushState({}, "", "/deals/3");
    render(<HomeLink toastMessage="Back to the Playbook…">Hub</HomeLink>);
    fireEvent.click(screen.getByRole("link", { name: "Hub" }));
    expect(getToasts()[0]?.message).toBe("Back to the Playbook…");
  });
});
