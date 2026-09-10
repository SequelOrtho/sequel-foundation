// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, FieldError, RequiredLegend, RequiredMark, fieldErrorId, REQUIRED_LEGEND_TEXT, ALL_REQUIRED_LEGEND_TEXT } from "../ui/Field";
import { AdaptiveSelect } from "../ui/AdaptiveSelect";
import { checkRequired, requiredSummary } from "../ui/required-fields";

afterEach(cleanup);

// DESIGN-CONVENTIONS §3 "Required fields": asterisk on the label (decorative),
// the control announces required, the form opens with a legend, and errors
// arrive on save under the field with the control marked invalid.

describe("RequiredMark / RequiredLegend", () => {
  it("renders a decorative asterisk the screen reader skips", () => {
    render(<RequiredMark />);
    const mark = screen.getByText("*");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
  });

  it("explains the asterisk once per form, or says everything is required", () => {
    const { rerender } = render(<RequiredLegend />);
    expect(screen.getByText(REQUIRED_LEGEND_TEXT)).toBeTruthy();
    rerender(<RequiredLegend allRequired />);
    expect(screen.getByText(ALL_REQUIRED_LEGEND_TEXT)).toBeTruthy();
  });
});

describe("Field", () => {
  it("marks a required label and associates the control explicitly when given an id", () => {
    render(
      <Field label="First name" required id="first">
        <input id="first" required aria-required="true" />
      </Field>,
    );
    const input = screen.getByLabelText(/First name/) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(screen.getByText("*").getAttribute("aria-hidden")).toBe("true");
  });

  it("renders the error as an alert with the id the control can describe itself by", () => {
    render(
      <Field label="Email" id="email" error="Email is required">
        <input id="email" aria-describedby={fieldErrorId("email")} aria-invalid />
      </Field>,
    );
    const err = screen.getByRole("alert");
    expect(err.textContent).toBe("Email is required");
    expect(err.id).toBe("email-error");
    expect(screen.getByLabelText(/Email/).getAttribute("aria-describedby")).toBe("email-error");
  });

  it("shares the native-field label geometry with AdaptiveSelect: inline label, control mt-0.5", () => {
    const { container } = render(
      <Field label="First name" id="first" hint="Saved as First Last">
        <input id="first" />
      </Field>,
    );
    const label = container.querySelector("label")!;
    expect(label.className).not.toContain("flex");
    expect(screen.getByText("First name").className).not.toContain("block");
    expect(screen.getByLabelText(/First name/).parentElement?.className).toContain("mt-0.5");
    expect(screen.getByText("Saved as First Last").className).toContain("mt-1");
  });

  it("honors a host form's label typography", () => {
    render(
      <Field label="Entity" labelClassName="uppercase text-brand-navy">
        <select />
      </Field>,
    );
    expect(screen.getByText("Entity").className).toContain("uppercase");
  });

  it("FieldError stands alone for hand-rolled fields", () => {
    render(<FieldError id="x-error">Bad</FieldError>);
    expect(screen.getByRole("alert").id).toBe("x-error");
  });
});

describe("AdaptiveSelect error wiring", () => {
  const options = [{ id: 1, label: "One" }, { id: 2, label: "Two" }];

  it("native rendering: shows the error, marks the select invalid, links them", () => {
    render(<AdaptiveSelect label="Entity" options={options} value={null} required error="Entity is required — choose one" />);
    const select = screen.getByLabelText(/Entity/) as HTMLSelectElement;
    expect(select.required).toBe(true);
    expect(select.getAttribute("aria-invalid")).toBe("true");
    const err = screen.getByRole("alert");
    expect(select.getAttribute("aria-describedby")).toBe(err.id);
  });

  it("searchable rendering: same contract on the combobox input", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, label: `Person ${i + 1}` }));
    render(<AdaptiveSelect label="Manager" options={many} value={null} required error="Manager is required — choose one" />);
    const input = screen.getByRole("combobox");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });

  it("renders no alert when there is no error", () => {
    render(<AdaptiveSelect label="Entity" options={options} value={1} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("checkRequired", () => {
  it("passes a complete, well-formed form", () => {
    const c = checkRequired([
      { key: "first", label: "First name", value: "Jordan" },
      { key: "email", label: "Email", value: "jordan@sequelortho.com", kind: "email" },
      { key: "entity", label: "Entity", value: 3, kind: "select" },
      { key: "hours", label: "Weekly hours", value: "40", kind: "number", min: 1, max: 168 },
    ]);
    expect(c.ok).toBe(true);
    expect(c.errors).toEqual({});
    expect(c.firstKey).toBeNull();
  });

  it("names every missing field with a standard message, first failure first", () => {
    const c = checkRequired([
      { key: "first", label: "First name", value: "  " },
      { key: "last", label: "Last name", value: "Reese" },
      { key: "entity", label: "Entity", value: null, kind: "select" },
    ]);
    expect(c.ok).toBe(false);
    expect(c.errors).toEqual({ first: "First name is required", entity: "Entity is required — choose one" });
    expect(c.firstKey).toBe("first");
  });

  it("checks email shape and numeric bounds, and says how to fix each", () => {
    const c = checkRequired([
      { key: "email", label: "Email", value: "jordan@sequelortho", kind: "email" },
      { key: "hours", label: "Weekly hours", value: "", kind: "number", min: 1 },
      { key: "zero", label: "Weekly hours", value: "0", kind: "number", min: 1 },
      { key: "text", label: "Weekly hours", value: "forty", kind: "number" },
    ]);
    expect(c.errors.email).toMatch(/valid email address, like name@sequelortho.com/);
    expect(c.errors.hours).toBe("Weekly hours is required");
    expect(c.errors.zero).toBe("Weekly hours must be at least 1");
    expect(c.errors.text).toBe("Weekly hours must be a number");
  });

  it("builds a one-line summary from the labels", () => {
    const c = checkRequired([
      { key: "first", label: "First name", value: "" },
      { key: "email", label: "Email", value: "", kind: "email" },
    ]);
    expect(requiredSummary(c, { first: "First name", email: "Email" })).toBe("Fix these fields to save: First name, Email.");
    const one = checkRequired([{ key: "first", label: "First name", value: "" }]);
    expect(requiredSummary(one, { first: "First name" })).toBe("Fix First name to save.");
  });
});
