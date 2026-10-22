import { describe, expect, it } from "vitest";
import * as ui from "../ui";
import * as testing from "../testing/unread-badge";

// The test reset lifts the signed-out screen's permanent clear, so it is never
// on the app barrel (review F20).
describe("UnreadBadge exports", () => {
  it("keeps the test reset off the ui barrel and on the testing subpath", () => {
    expect("resetUnreadBadgeForTests" in ui).toBe(false);
    expect(typeof testing.resetUnreadBadgeForTests).toBe("function");
    expect(typeof ui.stripShownBadge).toBe("function");
  });
});
