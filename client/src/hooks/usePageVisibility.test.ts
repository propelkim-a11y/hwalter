import { describe, expect, it } from "vitest";
import { isPageVisible } from "./usePageVisibility";

describe("isPageVisible", () => {
  it("treats a hidden page as inactive", () => {
    expect(isPageVisible("hidden")).toBe(false);
  });

  it("treats visible and unavailable visibility states as active", () => {
    expect(isPageVisible("visible")).toBe(true);
    expect(isPageVisible(undefined)).toBe(true);
  });
});
