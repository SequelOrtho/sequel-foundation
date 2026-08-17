// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useScrollToEdit } from "../ui/useScrollToEdit";

afterEach(cleanup);

function Harness() {
  const { ref, scrollToEdit } = useScrollToEdit<HTMLFormElement>();
  return (
    <div>
      <button onClick={scrollToEdit}>Edit</button>
      <form ref={ref} aria-label="edit form"><input aria-label="Name" /></form>
    </div>
  );
}

describe("useScrollToEdit", () => {
  it("scrolls the form into view and focuses its first field", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    vi.unstubAllGlobals();
  });
});
