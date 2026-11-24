import { describe, expect, it, vi } from "vitest";
import { isBrandActivationKey, restartBrandPulse } from "./brandInteraction";

describe("브랜드 영역 키보드 활성화", () => {
  it("Enter와 Space를 활성화 키로 인식한다", () => {
    expect(isBrandActivationKey("Enter")).toBe(true);
    expect(isBrandActivationKey(" ")).toBe(true);
  });

  it("다른 키는 활성화하지 않는다", () => {
    expect(isBrandActivationKey("Tab")).toBe(false);
    expect(isBrandActivationKey("Escape")).toBe(false);
    expect(isBrandActivationKey("ArrowDown")).toBe(false);
  });

  it("연속 활성화에서도 애니메이션을 false→true 순서로 다시 시작한다", () => {
    const setActive = vi.fn();
    const requestFrame = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });

    restartBrandPulse(setActive, requestFrame);
    restartBrandPulse(setActive, requestFrame);

    expect(setActive.mock.calls.map(([active]) => active)).toEqual([false, true, false, true]);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});
