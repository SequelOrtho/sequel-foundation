// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NoRoleNotice } from "../access/NoRoleNotice";

afterEach(cleanup);

describe("NoRoleNotice", () => {
  it("shows the family message and posts the pass to the request route", () => {
    const { container } = render(<NoRoleNotice appName="Sequel Scheduler Hub" pass="abc.def" email="pat@x.com" />);
    expect(screen.getByText(/doesn’t have a role in Sequel Scheduler Hub yet/)).toBeTruthy();
    expect(screen.getByText("pat@x.com")).toBeTruthy();
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/no-access/request");
    expect((form.querySelector('input[name="t"]') as HTMLInputElement).value).toBe("abc.def");
    expect(screen.getByRole("button", { name: "Request access" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/auth/signin");
  });

  it("hides the button without a pass and once a request is in", () => {
    render(<NoRoleNotice appName="Hub" />);
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull();
    cleanup();
    render(<NoRoleNotice appName="Hub" pass="abc.def" outcome="sent" />);
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull();
    expect(screen.getByText(/Request sent/)).toBeTruthy();
  });

  it("keeps the button after a failure so the person can retry", () => {
    render(<NoRoleNotice appName="Hub" pass="abc.def" outcome="failed" />);
    expect(screen.getByRole("button", { name: "Request access" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/couldn’t send/);
  });

  it("never claims 'no role' when the lookup was unavailable", () => {
    render(<NoRoleNotice appName="Hub" reason="unavailable" pass="abc.def" />);
    expect(screen.queryByText(/doesn’t have a role/)).toBeNull();
    expect(screen.getByText(/couldn’t confirm your role/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request access" })).toBeNull();
  });
});
