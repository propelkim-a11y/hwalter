import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const robotsText = readFileSync(
  fileURLToPath(new URL("../public/robots.txt", import.meta.url)),
  "utf8",
);

describe("robots.txt", () => {
  it("검색 엔진이 공개 웹앱 경로를 탐색할 수 있도록 허용한다", () => {
    expect(robotsText).toBe("User-agent: *\nAllow: /\n");
  });
});
