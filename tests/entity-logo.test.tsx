// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ENTITIES, ENTITY_KEYS } from "../brand/entities";
import { EntityLogo } from "../brand/EntityLogo";

afterEach(cleanup);

describe("EntityLogo", () => {
  it.each(ENTITY_KEYS)("%s auto renders color (light) + reverse (dark) at the registry aspect", (k) => {
    const { container } = render(<EntityLogo entity={k} height={32} />);
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(2);
    expect(imgs[0].className).toContain("dark:hidden");
    expect(imgs[1].className).toContain("hidden dark:block");
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBe(ENTITIES[k].logo.alt);
      expect(img.getAttribute("height")).toBe("32");
      expect(img.getAttribute("width")).toBe(String(Math.round(32 * ENTITIES[k].logo.aspect)));
    }
  });

  it("a pinned variant renders a single image with no theme toggling", () => {
    const { container } = render(<EntityLogo entity="FVO" variant="white" className="h-8" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].className).toBe("h-8");
    expect(imgs[0].getAttribute("src")).toContain("logo-white");
  });
});
