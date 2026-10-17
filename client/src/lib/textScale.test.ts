import { describe, expect, it } from "vitest";
import { getTextScalePercent, normalizeTextScale, TEXT_SCALE_OPTIONS } from "./textScale";

describe("글자 크기 설정", () => {
  it("작게·기본·크게·아주 크게의 네 가지 선택지를 제공한다", () => {
    expect(TEXT_SCALE_OPTIONS.map((option) => option.value)).toEqual([
      "small",
      "standard",
      "large",
      "xlarge",
    ]);
    expect(TEXT_SCALE_OPTIONS.map((option) => option.percent)).toEqual([94, 100, 113, 125]);
  });

  it("저장값이 없거나 올바르지 않으면 기본 글자 크기로 안전하게 복원한다", () => {
    expect(normalizeTextScale(null)).toBe("standard");
    expect(normalizeTextScale("invalid")).toBe("standard");
    expect(normalizeTextScale("large")).toBe("large");
  });

  it("선택값에 맞는 문서 글자 크기 비율을 제공한다", () => {
    expect(getTextScalePercent("small")).toBe(94);
    expect(getTextScalePercent("standard")).toBe(100);
    expect(getTextScalePercent("large")).toBe(113);
    expect(getTextScalePercent("xlarge")).toBe(125);
  });
});
