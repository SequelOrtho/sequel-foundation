// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoAccessNotice, NotFoundNotice, PageErrorNotice } from "../ui/AccessNotices";
import {
  DEFAULT_ADMIN_LABEL,
  NO_ACCESS_HEADING,
  NOT_FOUND_HEADING,
  PAGE_ERROR_HEADING,
  noAccessMessage,
  notFoundMessage,
  pageErrorMessage,
} from "../ui/access-copy";

afterEach(cleanup);

const APP = "Sequel Scheduler Hub";

describe("access copy", () => {
  it("no-access names the hub, the role, and the hub's System Administrator", () => {
    expect(noAccessMessage(APP, { roleLabel: "Provider" })).toBe(
      "Your role in Sequel Scheduler Hub (Provider) doesn’t include this page or the information on it. " +
        "If you think you should have access, contact the Sequel Scheduler Hub System Administrator.",
    );
  });

  it("no-access reads cleanly without a role and takes the hub's own admin label", () => {
    const text = noAccessMessage("Sequel Project Hub", { adminLabel: "System Admin" });
    expect(text).toContain("Your role in Sequel Project Hub doesn’t include");
    expect(text).not.toContain("()");
    expect(text).toContain("contact the Sequel Project Hub System Admin.");
  });

  it("not-found never says the record exists — it reads the same for missing and hidden", () => {
    const text = notFoundMessage(APP);
    expect(text).toContain("may have been moved or removed");
    expect(text).toContain("may not be open to your role");
    expect(text).toContain(`contact the ${APP} ${DEFAULT_ADMIN_LABEL}`);
  });

  it("page-error points at the admin only if the failure repeats", () => {
    expect(pageErrorMessage(APP)).toContain("couldn’t load this page. Try again in a moment.");
    expect(pageErrorMessage(APP, { adminLabel: "Admin" })).toContain(`contact the ${APP} Admin.`);
  });
});

describe("NoAccessNotice", () => {
  it("renders the heading, the message and a plain Home link", () => {
    render(<NoAccessNotice appName={APP} roleLabel="Viewer" />);
    expect(screen.getByRole("heading", { level: 1, name: NO_ACCESS_HEADING })).toBeTruthy();
    expect(screen.getByText(noAccessMessage(APP, { roleLabel: "Viewer" }))).toBeTruthy();
    const home = screen.getByRole("link", { name: "Go to Home" });
    expect(home.getAttribute("href")).toBe("/");
  });
});

describe("NotFoundNotice", () => {
  it("renders the neutral message and an optional hub-wide second step", () => {
    render(<NotFoundNotice appName={APP} secondary={{ href: "/me", label: "Open My Schedule" }} />);
    expect(screen.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING })).toBeTruthy();
    expect(screen.getByText(notFoundMessage(APP))).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open My Schedule" }).getAttribute("href")).toBe("/me");
  });
});

describe("PageErrorNotice", () => {
  it("offers Try Again when given a retry and shows the digest", () => {
    const retry = vi.fn();
    render(<PageErrorNotice appName={APP} onRetry={retry} digest="abc123" />);
    expect(screen.getByRole("heading", { level: 1, name: PAGE_ERROR_HEADING })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("Reference: abc123")).toBeTruthy();
    // The danger Callout is announced.
    expect(screen.getByRole("alert").textContent).toContain(pageErrorMessage(APP));
  });

  it("falls back to Home only without a retry", () => {
    render(<PageErrorNotice appName={APP} />);
    expect(screen.queryByRole("button", { name: "Try Again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to Home" })).toBeTruthy();
  });
});
