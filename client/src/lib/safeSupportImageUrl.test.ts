import { describe, expect, it } from "vitest";
import { safeSupportImageUrl } from "./safeSupportImageUrl";

describe("safeSupportImageUrl", () => {
  it("기타 안내 전용 Supabase 버킷의 공개 JPEG 주소만 허용한다", () => {
    const url = "https://hcatwwprdavonekfgbzx.supabase.co/storage/v1/object/public/support-images/public/example.jpg";
    expect(safeSupportImageUrl(url)).toBe(url);
  });

  it("외부 주소, 다른 버킷, 비 JPEG 주소와 잘못된 값을 거부한다", () => {
    expect(safeSupportImageUrl("https://example.com/image.jpg")).toBeNull();
    expect(safeSupportImageUrl("https://hcatwwprdavonekfgbzx.supabase.co/storage/v1/object/public/other/public/image.jpg")).toBeNull();
    expect(safeSupportImageUrl("https://hcatwwprdavonekfgbzx.supabase.co/storage/v1/object/public/support-images/public/image.png")).toBeNull();
    expect(safeSupportImageUrl("not-a-url")).toBeNull();
  });
});
