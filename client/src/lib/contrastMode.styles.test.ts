import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  fileURLToPath(new URL("../index.css", import.meta.url)),
  "utf8",
);

describe("고대비 색상 스타일", () => {
  it("카드·본문·배지·버튼·링크·테두리에 명확한 대비 규칙을 적용한다", () => {
    expect(styles).toContain('html[data-hwalter-contrast="high"]');
    expect(styles).toContain(":not(header):not(button):not(a)[style*=\"background\"]");
    expect(styles).toContain(":not(header):not(button):not(a)[style*=\"color\"]");
    expect(styles).toContain(":is(button, a)[style*=\"background\"]");
    expect(styles).toContain("background: #FFFFFF !important");
    expect(styles).toContain("background: #17251A !important");
    expect(styles).toContain("color: #FFFFFF !important");
    expect(styles).toContain("border-color: #17351F !important");
  });
});
