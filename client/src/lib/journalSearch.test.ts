import { describe, expect, it } from "vitest";
import { filterJournalRecords } from "./journalSearch";

const records = [
  { id: "seoul", date: "2026-08-28T01:00:00.000Z", memo: "바람이 강함", clubName: "서울 황학정" },
  { id: "daejeon", date: "2026-08-27T01:00:00.000Z", memo: "자세 연습", clubName: "대전 주몽정" },
];

describe("시수 일지 검색", () => {
  it("빈 검색어에서는 모든 기록을 유지한다", () => {
    expect(filterJournalRecords(records, "  ")).toEqual(records);
  });

  it("메모와 활터명으로 대소문자 구분 없이 기록을 찾는다", () => {
    expect(filterJournalRecords(records, "자세").map((record) => record.id)).toEqual(["daejeon"]);
    expect(filterJournalRecords(records, "황학정").map((record) => record.id)).toEqual(["seoul"]);
  });

  it("하이픈 또는 점으로 입력한 날짜를 찾는다", () => {
    expect(filterJournalRecords(records, "2026-08-28").map((record) => record.id)).toEqual(["seoul"]);
    expect(filterJournalRecords(records, "2026.08.27").map((record) => record.id)).toEqual(["daejeon"]);
  });

  it("시작일과 종료일을 포함한 기간으로 기록을 제한한다", () => {
    expect(filterJournalRecords(records, "", { startDate: "2026-08-28" }).map((record) => record.id)).toEqual(["seoul"]);
    expect(filterJournalRecords(records, "", { endDate: "2026-08-27" }).map((record) => record.id)).toEqual(["daejeon"]);
    expect(filterJournalRecords(records, "", { startDate: "2026-08-27", endDate: "2026-08-27" }).map((record) => record.id)).toEqual(["daejeon"]);
  });

  it("기간과 텍스트 검색 조건을 함께 적용한다", () => {
    expect(filterJournalRecords(records, "연습", { startDate: "2026-08-28" })).toEqual([]);
    expect(filterJournalRecords(records, "바람", { startDate: "2026-08-28", endDate: "2026-08-28" }).map((record) => record.id)).toEqual(["seoul"]);
  });
});
