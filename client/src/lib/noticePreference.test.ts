import { describe, expect, it } from "vitest";
import { canRestoreDismissedNotice, shouldShowNotice } from "./noticePreference";

describe("shouldShowNotice", () => {
  it("shows a non-empty notice when it was not dismissed", () => {
    expect(shouldShowNotice("활터 이용 안내", null)).toBe(true);
  });

  it("hides only the exact notice text dismissed by the user", () => {
    expect(shouldShowNotice("활터 이용 안내", "활터 이용 안내")).toBe(false);
    expect(shouldShowNotice("새 공지", "활터 이용 안내")).toBe(true);
  });

  it("does not show an empty notice", () => {
    expect(shouldShowNotice("", null)).toBe(false);
  });

  it("allows restoring only the currently active dismissed notice", () => {
    expect(canRestoreDismissedNotice("활터 이용 안내", "활터 이용 안내")).toBe(true);
    expect(canRestoreDismissedNotice("새 공지", "활터 이용 안내")).toBe(false);
    expect(canRestoreDismissedNotice("", "활터 이용 안내")).toBe(false);
  });
});
