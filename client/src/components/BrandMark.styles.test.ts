import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styleSource = readFileSync(
  fileURLToPath(new URL("../index.css", import.meta.url)),
  "utf8",
);

describe("삼족오 마크 호버 스타일", () => {
  it("마우스 호버 환경에서만 은은한 빛과 짧은 움직임을 표시한다", () => {
    expect(styleSource).toContain("@media (hover: hover) and (prefers-reduced-motion: no-preference)");
    expect(styleSource).toContain(".samjoko-brand-mark:hover");
    expect(styleSource).toContain("transform: translateY(-1px) scale(1.04)");
    expect(styleSource).toContain("brightness(1.18) drop-shadow(0 0 7px rgba(247, 240, 223, 0.8))");
  });

  it("동작 줄이기 환경에서는 호버 전환을 중지한다", () => {
    expect(styleSource).toContain(".stat-fade-in, .stat-skeleton, .stat-refreshing, .samjoko-brand-mark");
    expect(styleSource).toContain("transition: none;");
  });
});
