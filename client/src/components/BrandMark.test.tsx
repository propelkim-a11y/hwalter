/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("브랜드 마크를 장식용 이미지로 렌더링하고 지정한 크기를 적용한다", () => {
    const { container } = render(
      <BrandMark
        size={32}
        className="shrink-0 invert mix-blend-screen drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]"
      />,
    );
    const mark = container.querySelector("img");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(mark?.getAttribute("width")).toBe("32");
    expect(mark?.getAttribute("height")).toBe("32");
    expect(mark?.getAttribute("src")).toBe("/samjoko-brand-mark.png");
    expect(mark?.className).toContain("shrink-0");
    expect(mark?.className).toContain("invert");
    expect(mark?.className).toContain("mix-blend-screen");
    expect(mark?.className).toContain("drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]");
  });
});
