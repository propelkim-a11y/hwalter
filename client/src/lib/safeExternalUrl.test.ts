import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safeExternalUrl";

describe("safeExternalUrl", () => {
  it("http와 https 장소 링크만 허용한다", () => {
    expect(safeExternalUrl("https://map.example.com/place")).toBe("https://map.example.com/place");
    expect(safeExternalUrl("http://example.com/location")).toBe("http://example.com/location");
  });

  it("비어 있거나 안전하지 않은 주소는 표시하지 않는다", () => {
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("data:text/html,test")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
});
