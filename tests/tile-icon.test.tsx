// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AreaTile, AreaTileGrid, areaTileClasses } from "../ui/AreaTile";
import { TILE_ICON_CLASS, TILE_ICON_MUTED_CLASS, TILE_ICON_NAMES, TileIcon, isTileIconName } from "../ui/TileIcon";

afterEach(cleanup);

describe("TileIcon", () => {
  it("carries the Incident Hub admin glyphs the set was drawn from", () => {
    for (const name of ["people-access", "routing", "clock", "letter", "organization"]) {
      expect(TILE_ICON_NAMES).toContain(name);
    }
  });

  it.each(TILE_ICON_NAMES)("%s renders a decorative 24-grid line glyph", (name) => {
    const { container } = render(<TileIcon name={name} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("class")).toBe(TILE_ICON_CLASS);
    expect(svg.getAttribute("data-tile-icon")).toBe(name);
    expect(svg.querySelectorAll("path, circle, rect, ellipse").length).toBeGreaterThan(0);
  });

  it("takes a size and a replacement class", () => {
    const { container } = render(<TileIcon name="bell" size={28} className="text-white" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("28");
    expect(svg.getAttribute("class")).toBe("text-white");
  });

  it("carries the landing and section tile ideas (v0.25.0)", () => {
    for (const name of [
      "shield-alert", "message", "eye-off", "user-alert", "gavel", "clipboard-check", "download", "flag", "gantt",
      "pulse", "lightbulb", "database", "capacity", "file-x", "cart", "archive", "calendar-off", "banknote",
    ]) {
      expect(TILE_ICON_NAMES).toContain(name);
    }
  });

  it("offers a muted class for locked tiles that keeps the flex guard", () => {
    expect(TILE_ICON_MUTED_CLASS).toContain("shrink-0");
    expect(TILE_ICON_MUTED_CLASS).toContain("dark:");
    expect(TILE_ICON_MUTED_CLASS).not.toContain("brand-navy");
  });

  it("guards names with an own-key check", () => {
    expect(isTileIconName("bell")).toBe(true);
    expect(isTileIconName("toString")).toBe(false);
    expect(isTileIconName("nope")).toBe(false);
  });
});

describe("AreaTile", () => {
  it("is one link carrying icon, title heading and description", () => {
    render(
      <AreaTileGrid>
        <AreaTile href="/admin/access" title="People & Access" description="Who can sign in." icon="people-access" />
      </AreaTileGrid>,
    );
    const link = screen.getByRole("link", { name: /People & Access/ });
    expect(link.getAttribute("href")).toBe("/admin/access");
    expect(screen.getByRole("heading", { level: 2, name: "People & Access" })).toBeTruthy();
    expect(link.querySelector('svg[data-tile-icon="people-access"]')).toBeTruthy();
    expect(link.textContent).toContain("Who can sign in.");
    expect(screen.getByRole("list").className).toContain("lg:grid-cols-3");
  });

  it("renders no footer without status or attention", () => {
    const { container } = render(
      <AreaTileGrid>
        <AreaTile href="/a" title="A" description="d" icon="bell" />
      </AreaTileGrid>,
    );
    expect(container.querySelector(".mt-auto")).toBeNull();
  });

  it("pairs attention with a glyph and words, above the status", () => {
    render(
      <AreaTileGrid>
        <AreaTile href="/a" title="A" description="d" icon="bell" status="12 people mapped" attention="3 waiting for a role" />
      </AreaTileGrid>,
    );
    const attention = screen.getByText("3 waiting for a role");
    expect(attention.textContent).toContain("⚠");
    const status = screen.getByText("12 people mapped");
    expect(attention.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("emphasis swaps the neutral border for the brand border", () => {
    expect(areaTileClasses(true)).toContain("border-brand ");
    expect(areaTileClasses(true)).not.toContain("border-zinc-200");
    expect(areaTileClasses(false)).toContain("border-zinc-200");
  });
});
