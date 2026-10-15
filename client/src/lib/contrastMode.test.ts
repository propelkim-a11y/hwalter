import { describe, expect, it } from "vitest";
import { isHighContrastEnabled } from "./contrastMode";

describe("고대비 색상 모드", () => {
  it("명시적으로 true를 저장한 경우에만 고대비 모드를 활성화한다", () => {
    expect(isHighContrastEnabled("true")).toBe(true);
    expect(isHighContrastEnabled("false")).toBe(false);
    expect(isHighContrastEnabled(null)).toBe(false);
    expect(isHighContrastEnabled("invalid")).toBe(false);
  });
});
