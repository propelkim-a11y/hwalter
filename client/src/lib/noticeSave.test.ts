import { describe, expect, it } from "vitest";
import { resolveNoticeSaveValues } from "./noticeSave";

describe("resolveNoticeSaveValues", () => {
  it("입력란이 비어 있고 게시 중인 공지가 있으면 기존 공지와 만료일을 보존한다", () => {
    expect(resolveNoticeSaveValues("   ", "", "정기 활쏘기 안내", "2026-09-01")).toEqual({
      notice: "정기 활쏘기 안내",
      expiry: "2026-09-01",
      preserved: true,
    });
  });

  it("새 공지를 입력하면 공지와 만료일을 새 값으로 저장한다", () => {
    expect(resolveNoticeSaveValues("  활터 정비 안내  ", "2026-09-15", "이전 공지", "2026-09-01")).toEqual({
      notice: "활터 정비 안내",
      expiry: "2026-09-15",
      preserved: false,
    });
  });

  it("기존 공지가 없으면 빈 입력값도 빈 공지로 유지한다", () => {
    expect(resolveNoticeSaveValues("", "", "", "")).toEqual({
      notice: "",
      expiry: "",
      preserved: false,
    });
  });
});
