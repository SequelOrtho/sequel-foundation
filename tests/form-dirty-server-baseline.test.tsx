// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { formSnapshot, serverSnapshot, snapshotEqual } from "../ui/form-dirty";
import { useFormDirty } from "../ui/SectionSave";

// The dirty baseline is the form as the server sent it, never the live form:
// a pick made while the page's script is loading (or put back by the browser
// after a reload) is in the form before any hook runs. Project Hub, 2026-11-16:
// a Type changed to JDI kept coming back as Sprint, with Save switched off.

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function formFrom(html: string): HTMLFormElement {
  const host = document.createElement("div");
  host.innerHTML = `<form>${html}</form>`;
  document.body.appendChild(host);
  return host.querySelector("form")!;
}

const EVERY_CONTROL = `
  <input name="title" value="Plan" />
  <input name="blank" />
  <input name="unnamed-not" />
  <input value="no name" />
  <input type="number" name="hours" value="40" />
  <input type="number" name="badNumber" value="1,000" />
  <input type="date" name="due" value="2026-11-16" />
  <input type="hidden" name="id" value="7" />
  <input type="checkbox" name="flags" value="it" checked />
  <input type="checkbox" name="flags" value="analytics" />
  <input type="checkbox" name="flags" value="facilities" checked />
  <input type="radio" name="size" value="s" />
  <input type="radio" name="size" value="m" checked />
  <input type="file" name="upload" />
  <input type="submit" name="go" value="Save" />
  <button name="action" value="x">Save</button>
  <input name="off" value="hidden from FormData" disabled />
  <fieldset disabled><input name="inFieldset" value="also left out" /></fieldset>
  <textarea name="notes">line one&#13;&#10;line two</textarea>
  <select name="type"><option value="Sprint">Sprint</option><option value="JDI" selected>JDI</option></select>
  <select name="unmarked"><option value="a">A</option><option value="b">B</option></select>
  <select name="many" multiple><option value="1" selected>1</option><option value="2">2</option><option value="3" selected>3</option></select>
`;

describe("serverSnapshot", () => {
  it("equals the live snapshot of a form nobody has touched, control type by control type", () => {
    const form = formFrom(EVERY_CONTROL);
    expect(serverSnapshot(form)).toEqual(formSnapshot(form));
    expect(snapshotEqual(serverSnapshot(form), formSnapshot(form))).toBe(true);
    expect(serverSnapshot(form, { hydrating: true })).toEqual(formSnapshot(form));
  });

  it("reads a text box holding CRLF as its value reads it", () => {
    const form = formFrom("");
    const box = document.createElement("textarea");
    box.name = "notes";
    box.defaultValue = "a\r\nb";
    form.appendChild(box);
    expect(serverSnapshot(form)).toEqual({ notes: "a\nb" });
    expect(serverSnapshot(form)).toEqual(formSnapshot(form));
    // The control itself is never written.
    expect(box.defaultValue).toBe("a\r\nb");
  });

  it("reads a select with no option marked by where the form came from", () => {
    const form = formFrom(`
      <select name="one"><option value="" disabled>Pick…</option><option value="a">A</option><option value="b">B</option></select>
      <select name="list" size="4"><option value="a">A</option><option value="b">B</option></select>
      <select name="many" multiple><option value="1">1</option><option value="2">2</option></select>
    `);
    // Untouched server HTML: the browser's own starting selection.
    expect(serverSnapshot(form, { hydrating: true })).toEqual({ one: "a" });
    (form.querySelector('[name="one"]') as HTMLSelectElement).value = "b";
    (form.querySelector('[name="list"]') as HTMLSelectElement).value = "b";
    (form.querySelector('[name="many"]') as HTMLSelectElement).options[1].selected = true;
    // From the server, those are early picks; drawn in the browser, the loaded values.
    expect(serverSnapshot(form, { hydrating: true })).toEqual({ one: "a" });
    expect(serverSnapshot(form)).toEqual({ one: "b", list: "b", many: "2" });
  });

  it("keeps the server's values after every kind of control is changed", () => {
    const form = formFrom(EVERY_CONTROL);
    const before = serverSnapshot(form);
    const el = <T extends Element>(q: string) => form.querySelector(q) as T;
    el<HTMLInputElement>('[name="title"]').value = "Changed";
    el<HTMLInputElement>('[name="hours"]').value = "8";
    el<HTMLInputElement>('[name="flags"][value="analytics"]').checked = true;
    el<HTMLInputElement>('[name="flags"][value="it"]').checked = false;
    el<HTMLInputElement>('[name="size"][value="s"]').checked = true;
    el<HTMLTextAreaElement>('[name="notes"]').value = "rewritten";
    el<HTMLSelectElement>('[name="type"]').value = "Sprint";
    el<HTMLSelectElement>('[name="many"]').options[1].selected = true;
    expect(serverSnapshot(form)).toEqual(before);
    expect(snapshotEqual(before, formSnapshot(form))).toBe(false);
    expect(formSnapshot(form).type).toBe("Sprint");
    expect(before.type).toBe("JDI");
  });
});

function Probe({ controlled = false, unmarked = false }: { controlled?: boolean; unmarked?: boolean }) {
  const d = useFormDirty();
  const [type, setType] = useState("Sprint");
  return (
    <form ref={d.attach} onInput={d.recheck} onChange={d.recheck}>
      <input name="title" defaultValue="Plan" aria-label="Title" />
      {controlled ? (
        <select name="type" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="Sprint">Sprint</option>
          <option value="JDI">JDI</option>
        </select>
      ) : (
        <select name="type" aria-label="Type" defaultValue="Sprint">
          <option value="Sprint">Sprint</option>
          <option value="JDI">JDI</option>
        </select>
      )}
      {unmarked && (
        <select name="owner" aria-label="Owner">
          <option value="">Pick one…</option>
          <option value="ann">Ann</option>
        </select>
      )}
      <button type="button" disabled={!d.dirty} onClick={d.markClean}>
        Save
      </button>
    </form>
  );
}

describe("useFormDirty", () => {
  let unmount: (() => void) | null = null;
  afterEach(() => {
    unmount?.();
    unmount = null;
    document.body.innerHTML = "";
  });

  /** Server HTML first, `early` while "the script is loading", then hydrate. */
  async function loadSlowly(ui: React.ReactElement, early: (root: HTMLElement) => void) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    root.innerHTML = renderToString(ui);
    early(root);
    await act(async () => {
      const r = hydrateRoot(root, ui);
      unmount = () => r.unmount();
    });
    return root;
  }
  const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

  it("starts clean when nothing was touched while the page loaded", async () => {
    await loadSlowly(<Probe />, () => {});
    expect(save().disabled).toBe(true);
  });

  it("counts a pick made before the script loaded as a change, and clears on save", async () => {
    const root = await loadSlowly(<Probe />, (r) => {
      (r.querySelector('[name="type"]') as HTMLSelectElement).value = "JDI";
    });
    expect((root.querySelector('[name="type"]') as HTMLSelectElement).value).toBe("JDI");
    expect(save().disabled).toBe(false);
    fireEvent.click(save());
    expect(save().disabled).toBe(true);
    // Back to the server's value is now a change from what was saved.
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Sprint" } });
    expect(save().disabled).toBe(false);
  });

  it("counts an early pick on a select with no option marked as selected", async () => {
    await loadSlowly(<Probe unmarked />, (r) => {
      (r.querySelector('[name="owner"]') as HTMLSelectElement).value = "ann";
    });
    expect(save().disabled).toBe(false);
  });

  it("a select with no option marked starts clean when untouched", async () => {
    await loadSlowly(<Probe unmarked />, () => {});
    expect(save().disabled).toBe(true);
  });

  it("a controlled field React puts back over an early pick does not leave Save on", async () => {
    const root = await loadSlowly(<Probe controlled />, (r) => {
      (r.querySelector('[name="type"]') as HTMLSelectElement).value = "JDI";
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 5));
    });
    expect((root.querySelector('[name="type"]') as HTMLSelectElement).value).toBe("Sprint");
    expect(save().disabled).toBe(true);
  });

  it("counts text typed before the script loaded as a change", async () => {
    await loadSlowly(<Probe />, (r) => {
      (r.querySelector('[name="title"]') as HTMLInputElement).value = "Plan B";
    });
    expect(save().disabled).toBe(false);
  });

  it("an early pick put back to the loaded value reads clean after the next input", async () => {
    const root = await loadSlowly(<Probe />, (r) => {
      (r.querySelector('[name="type"]') as HTMLSelectElement).value = "JDI";
    });
    fireEvent.change(root.querySelector('[name="type"]')!, { target: { value: "Sprint" } });
    expect(save().disabled).toBe(true);
  });

  it("a form drawn only in the browser starts clean and follows edits, controlled fields included", () => {
    render(<Probe controlled />);
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "JDI" } });
    expect(save().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Sprint" } });
    expect(save().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Plan B" } });
    expect(save().disabled).toBe(false);
  });
});
