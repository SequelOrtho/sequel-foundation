import { describe, expect, it, vi } from "vitest";
import { connectorIdentity, inConnectorScope, runAsConnector, scopedAuth } from "../connector/server";

describe("connector scope", () => {
  it("answers the connection's session inside the scope only", async () => {
    const real = vi.fn(async (..._args: unknown[]) => ({ user: "browser" }));
    const auth = scopedAuth(real);
    expect(inConnectorScope()).toBe(false);
    const inside = await runAsConnector({ session: { user: "pat" }, activeRole: "PM" }, async () => {
      expect(inConnectorScope()).toBe(true);
      expect(connectorIdentity()?.activeRole).toBe("PM");
      await new Promise((r) => setTimeout(r, 1));
      return auth();
    });
    expect(inside).toEqual({ user: "pat" });
    expect(real).not.toHaveBeenCalled();
    expect(await auth()).toEqual({ user: "browser" });
    expect(connectorIdentity()).toBeNull();
  });
  it("passes calls with arguments through, even inside the scope", async () => {
    const real = vi.fn(async (..._args: unknown[]) => "real");
    const auth = scopedAuth(real);
    await runAsConnector({ session: 1, activeRole: "x" }, async () => {
      expect(await auth("req" as never)).toBe("real");
    });
    expect(real).toHaveBeenCalledWith("req");
  });
  it("keeps two scopes apart when they run at once", async () => {
    const seen = await Promise.all(
      ["a", "b"].map((role) =>
        runAsConnector({ session: role, activeRole: role }, async () => {
          await new Promise((r) => setTimeout(r, role === "a" ? 5 : 1));
          return connectorIdentity()?.session;
        }),
      ),
    );
    expect(seen).toEqual(["a", "b"]);
  });
});
