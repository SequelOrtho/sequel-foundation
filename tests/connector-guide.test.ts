import { describe, expect, it } from "vitest";
import { companyAccountLabel, connectorGuideHtml, END_REASONS, noticeFor } from "../connector";

const html = connectorGuideHtml({ hubName: "Sequel Project Hub", company: "Sequel Ortho", adminLabel: "System Administrator", workEmailDomains: "@sequelortho.com" });

describe("connectorGuideHtml", () => {
  it("names the lifetimes and the checkbox", () => {
    expect(html).toContain("7 days without use");
    expect(html).toContain("14 days after you allow it");
    expect(html).toContain("7-day or 14-day limit");
    expect(html).toContain(companyAccountLabel("Sequel Ortho"));
  });
  it("is for users only", () => {
    expect(html).toContain('Look for <strong>Sequel Project Hub</strong> in the list and click <span class="click">Connect</span>');
    expect(html).not.toMatch(/Owner|Organization settings|custom connector|\/api\/mcp|request headers|OAuth client/i);
    expect(html).toContain("Ask the Hub System Administrator.");
  });
  it("stands alone", () => {
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).not.toMatch(/<script|<link|<img|<iframe|@import|url\(|\ssrc=|prefers-color-scheme|data-theme/i);
    expect(html).toContain("@media print");
    const external = [...html.matchAll(/(?:href|src)\s*=\s*["']?(https?:[^"'\s>]+)/gi)].map((m) => m[1]);
    expect(external.every((u) => u === "https://claude.ai")).toBe(true);
  });
  it("escapes what the hub passes in", () => {
    const h = connectorGuideHtml({ hubName: "<b>Hub</b>", company: "A&B", adminLabel: "Admin" });
    expect(h).not.toContain("<b>Hub</b>");
    expect(h).toContain("&lt;b&gt;Hub&lt;/b&gt;");
  });
});

describe("noticeFor", () => {
  it("words every end but the person's own", () => {
    for (const r of END_REASONS) {
      const n = noticeFor(r, { hubName: "Hub", adminLabel: "System Administrator" });
      if (r === "person") expect(n).toBeNull();
      else expect(n?.why).toBeTruthy();
    }
    expect(noticeFor("admin", { hubName: "Hub", adminLabel: "A" })?.connectionsPage).toBe(false);
  });
});
