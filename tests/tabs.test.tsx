// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Tabs } from "../ui/Tabs";

afterEach(() => cleanup());

describe("Tabs", () => {
  it("renders one link per tab, the default tab as the bare URL, aria-current on the active one", () => {
    render(
      <Tabs
        basePath="/admin"
        defaultTab="pending"
        active="approved"
        tabs={[
          { key: "pending", label: "Pending", count: 4 },
          { key: "approved", label: "Approved", count: 0 },
          { key: "all", label: "All" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Filter" })).toBeTruthy();
    const pending = screen.getByRole("link", { name: /Pending/ });
    const approved = screen.getByRole("link", { name: /Approved/ });
    const all = screen.getByRole("link", { name: "All" });
    expect(pending.getAttribute("href")).toBe("/admin");
    expect(approved.getAttribute("href")).toBe("/admin?tab=approved");
    expect(all.getAttribute("href")).toBe("/admin?tab=all");
    expect(approved.getAttribute("aria-current")).toBe("page");
    expect(pending.getAttribute("aria-current")).toBeNull();
    // Counts render as pills, including zero, and read as ", 4" to a screen reader.
    expect(pending.textContent).toBe("Pending, 4");
    expect(approved.textContent).toBe("Approved, 0");
    expect(all.textContent).toBe("All");
  });

  it("honours a per-tab href override, a renamed param, and a custom label", () => {
    render(
      <Tabs
        basePath="/projects/9"
        defaultTab="overview"
        active="overview"
        param="view"
        label="Project sections"
        query={{ from: "portfolio" }}
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "gates", label: "Gates" },
          { key: "tasks", label: "Tasks", href: "/projects/9/tasks" },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Project sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/projects/9?from=portfolio");
    expect(screen.getByRole("link", { name: "Gates" }).getAttribute("href")).toBe("/projects/9?from=portfolio&view=gates");
    expect(screen.getByRole("link", { name: "Tasks" }).getAttribute("href")).toBe("/projects/9/tasks");
  });
});
