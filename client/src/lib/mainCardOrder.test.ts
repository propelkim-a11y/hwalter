import { describe, expect, it } from "vitest";
import { DEFAULT_MAIN_CARD_ORDER, moveMainCard, normalizeMainCardOrder, normalizeMainCardVisibility } from "./mainCardOrder";

describe("메인 카드 순서", () => {
  it("저장된 순서가 비어 있거나 잘못되어도 모든 기본 카드를 복원한다", () => {
    expect(normalizeMainCardOrder(undefined)).toEqual(DEFAULT_MAIN_CARD_ORDER);
    expect(normalizeMainCardOrder(["record", "unknown", "record"])).toEqual([
      "record", "tree", "location", "status", "stats", "journal", "support",
    ]);
  });

  it("드래그한 카드를 대상 카드 위치로 옮긴다", () => {
    expect(moveMainCard(DEFAULT_MAIN_CARD_ORDER, "journal", "tree")).toEqual([
      "journal", "tree", "location", "status", "record", "stats", "support",
    ]);
    expect(moveMainCard(DEFAULT_MAIN_CARD_ORDER, "record", "record")).toEqual(DEFAULT_MAIN_CARD_ORDER);
  });

  it("카드 표시 상태는 저장된 불리언만 반영하고 나머지는 표시한다", () => {
    expect(normalizeMainCardVisibility({ record: false, stats: true, unknown: false })).toMatchObject({
      tree: true,
      location: true,
      status: true,
      record: false,
      stats: true,
      journal: true,
      support: true,
    });
  });
});
