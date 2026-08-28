import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../public/manifest.json", import.meta.url)),
    "utf8",
  ),
) as {
  display: string;
  start_url: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

describe("Android 웹 앱 매니페스트", () => {
  it("홈 화면 추가를 위한 독립 실행형 시작 경로를 제공한다", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toBe("#294B31");
  });

  it("녹색 바탕의 흰색 삼족오 PNG를 Android 설치 크기와 마스크형으로 모두 등록한다", () => {
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192.png?v=20260827-samjoko-v2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=20260827-samjoko-v2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=20260827-samjoko-v2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });
});
