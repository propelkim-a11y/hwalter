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
    expect(styleSource).toContain("transform: translateY(-2px) scale(1.1)");
    expect(styleSource).toContain("brightness(1.35) drop-shadow(0 0 12px rgba(247, 240, 223, 0.95))");
  });

  it("동작 줄이기 환경에서는 호버 전환을 중지한다", () => {
    expect(styleSource).toContain(".stat-fade-in, .stat-skeleton, .stat-refreshing, .samjoko-brand-mark");
    expect(styleSource).toContain("transition: none;");
  });

  it("모바일 터치 중에는 짧은 확대와 은은한 빛으로 피드백한다", () => {
    expect(styleSource).toContain("@media (hover: none) and (prefers-reduced-motion: no-preference)");
    expect(styleSource).toContain(".samjoko-brand-mark:active");
    expect(styleSource).toContain("transform: scale(1.06)");
    expect(styleSource).toContain("brightness(1.22) drop-shadow(0 0 8px rgba(247, 240, 223, 0.85))");
    expect(styleSource).toContain("transition-duration: 120ms");
  });

  it("헤더 터치 시 삼족오가 빛나며 회전한다", () => {
    expect(styleSource).toContain("@keyframes samjoko-brand-tap");
    expect(styleSource).toContain("transform: rotate(180deg) scale(1.14)");
    expect(styleSource).toContain("filter: brightness(1.48) drop-shadow(0 0 13px rgba(247, 240, 223, 0.98))");
    expect(styleSource).toContain(".samjoko-brand-mark--active");
    expect(styleSource).toContain("animation: samjoko-brand-tap 620ms");
  });
});
