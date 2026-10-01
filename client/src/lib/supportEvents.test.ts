import { describe, expect, it } from "vitest";
import { createSupportEvent, getVisibleSupportEventCount, MAX_SUPPORT_EVENTS, migrateLegacySupportEvent, normalizeSupportEvents } from "./supportEvents";

describe("기타 안내 다건 데이터", () => {
  it("안내 날짜 최신순으로 정리하며 최대 5건만 유지한다", () => {
    const events = normalizeSupportEvents(
      Array.from({ length: 6 }, (_, index) => ({
        id: `event-${index}`,
        title: `안내 ${index}`,
        content: "내용",
        date: `2026-09-0${index + 1}`,
        locationUrl: "",
        updatedAt: "2026-08-27T00:00:00.000Z",
      })),
    );

    expect(events).toHaveLength(MAX_SUPPORT_EVENTS);
    expect(events.map((event) => event.title)).toEqual(["안내 5", "안내 4", "안내 3", "안내 2", "안내 1"]);
  });

  it("기존 단일 기타 안내 설정을 첫 안내 항목으로 이관한다", () => {
    expect(migrateLegacySupportEvent("정기 활쏘기", "함께 활을 쏩니다.", "2026-09-01", "https://example.com")).toEqual([
      {
        id: "legacy-support-event",
        title: "정기 활쏘기",
        content: "함께 활을 쏩니다.",
        date: "2026-09-01",
        locationUrl: "https://example.com",
        imageUrl: "",
        updatedAt: "1970-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("제목·내용·날짜·링크·이미지가 모두 비어 있는 항목은 저장하지 않는다", () => {
    expect(normalizeSupportEvents([{ id: "empty", title: "", content: "", date: "", locationUrl: "", imageUrl: "", updatedAt: "2026-08-27T00:00:00.000Z" }])).toEqual([]);
  });

  it("이미지만 첨부된 안내도 보존한다", () => {
    expect(normalizeSupportEvents([{ id: "image-only", title: "", content: "", date: "", locationUrl: "", imageUrl: "https://example.com/image.jpg", updatedAt: "2026-08-27T00:00:00.000Z" }])[0]?.imageUrl).toBe("https://example.com/image.jpg");
  });

  it("사용자에게 실제로 표시되는 안내 수는 빈 목록의 기본 안내, 단일 안내, 다중 안내를 모두 반영한다", () => {
    expect(getVisibleSupportEventCount([])).toBe(1);
    expect(getVisibleSupportEventCount([createSupportEvent("2026-08-28T00:00:00.000Z")])).toBe(1);
    expect(getVisibleSupportEventCount([
      createSupportEvent("2026-08-28T00:00:00.000Z"),
      createSupportEvent("2026-08-27T00:00:00.000Z"),
      createSupportEvent("2026-08-26T00:00:00.000Z"),
    ])).toBe(3);
  });
});
