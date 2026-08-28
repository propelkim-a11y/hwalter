import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  fileURLToPath(new URL("../index.html", import.meta.url)),
  "utf8",
);

describe("앱 탭 메타데이터", () => {
  it("녹색 바탕의 흰색 삼족오 아이콘만 버전 경로로 브라우저 탭 파비콘에 사용한다", () => {
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=20260827-samjoko-v2" />',
    );
    expect(indexHtml).toContain(
      '<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=20260827-samjoko-v2" />',
    );
    expect(indexHtml).not.toContain("/manus-storage/");
  });

  it("iOS 홈 화면 추가 시 버전 경로의 512px 녹색·흰색 삼족오 애플 터치 아이콘을 사용한다", () => {
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon.png?v=20260827-samjoko-v2" />',
    );
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.json?v=20260827-samjoko-v2" />');
  });

  it("브라우저 UI 색상을 현재 헤더 녹색과 맞춘다", () => {
    expect(indexHtml).toContain('<meta name="theme-color" content="#294B31" />');
  });

  it("확대 가능한 모바일 뷰포트와 앱 설명을 제공한다", () => {
    expect(indexHtml).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
    expect(indexHtml).toContain('<meta name="description" content="국궁인을 위한 습사 기록 앱, 활터 현황과 개인 시수 통계를 한곳에서 확인하세요." />');
  });
});
