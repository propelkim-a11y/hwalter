/** @vitest-environment jsdom */
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("브랜드 마크를 장식용 이미지로 렌더링하고 지정한 크기를 적용한다", () => {
    const { container } = render(
      <BrandMark
        size={32}
        className="shrink-0 mix-blend-screen drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
      />,
    );
    const mark = container.querySelector("img");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("width")).toBe("32");
    expect(mark?.getAttribute("height")).toBe("32");
    expect(mark?.getAttribute("src")).toBe("/samjoko-brand-mark.png");
    expect(mark?.className).toContain("shrink-0");
    expect(mark?.className).toContain("mix-blend-screen");
    expect(mark?.className).toContain("drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]");
  });

  it("PWA의 터치 입력에서만 짧은 햅틱을 실행한다", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query === "(display-mode: standalone)" }),
    });
    const { container } = render(<BrandMark />);
    const mark = container.querySelector("img")!;

    fireEvent.pointerDown(mark, { pointerType: "touch" });

    expect(vibrate).toHaveBeenCalledWith(12);
  });

  it("브라우저 탭·마우스 입력에서는 햅틱을 실행하지 않는다", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({ matches: query === "(display-mode: standalone)" }),
    });
    const { container } = render(<BrandMark />);
    const mark = container.querySelector("img")!;

    fireEvent.pointerDown(mark, { pointerType: "mouse" });

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("동작 줄이기 설정에서는 PWA 터치 햅틱을 실행하지 않는다", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(display-mode: standalone)" || query === "(prefers-reduced-motion: reduce)",
      }),
    });
    const { container } = render(<BrandMark />);
    const mark = container.querySelector("img")!;

    fireEvent.pointerDown(mark, { pointerType: "touch" });

    expect(vibrate).not.toHaveBeenCalled();
  });
});
