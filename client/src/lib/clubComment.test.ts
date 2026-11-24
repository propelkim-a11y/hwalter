import { describe, expect, it } from "vitest";
import { getVisibleClubComment } from "./clubComment";

describe("getVisibleClubComment", () => {
  it("keeps a meaningful range memo", () => {
    expect(getVisibleClubComment("바람이 강함")).toBe("바람이 강함");
  });

  it("hides blank and placeholder-only range memos", () => {
    expect(getVisibleClubComment(undefined)).toBeNull();
    expect(getVisibleClubComment("   ")).toBeNull();
    expect(getVisibleClubComment("''")).toBeNull();
    expect(getVisibleClubComment('""')).toBeNull();
  });
});
