import { describe, expect, it } from "vitest";
import {
  formatRecordMediaSize,
  getPracticeRecordSaveMode,
  getRecordMediaKind,
  getRecordMediaValidationError,
  isPracticeRound,
  MAX_RECORD_MEDIA_BYTES,
  MAX_RECORD_MEDIA_ITEMS,
} from "./practiceRecord";

describe("습사 기록 저장 방식", () => {
  it("5시가 모두 입력되면 일반 습사 기록으로 저장한다", () => {
    expect(getPracticeRecordSaveMode({
      expertMode: false,
      normalShotCount: 5,
      expertArrowCount: 0,
      memo: "바람이 강함",
      attachmentCount: 1,
    })).toBe("round");
  });

  it("시수가 없고 메모 또는 첨부가 있으면 메모 기록으로 저장한다", () => {
    expect(getPracticeRecordSaveMode({
      expertMode: false,
      normalShotCount: 0,
      expertArrowCount: 0,
      memo: "활 손 위치 점검",
      attachmentCount: 0,
    })).toBe("memo");
    expect(getPracticeRecordSaveMode({
      expertMode: true,
      normalShotCount: 0,
      expertArrowCount: 0,
      memo: "",
      attachmentCount: 1,
    })).toBe("memo");
  });

  it("부분 입력과 완전히 빈 입력을 구분해 막는다", () => {
    expect(getPracticeRecordSaveMode({
      expertMode: false,
      normalShotCount: 2,
      expertArrowCount: 0,
      memo: "메모가 있어도 부분 시수는 저장하지 않음",
      attachmentCount: 0,
    })).toBe("invalid-partial");
    expect(getPracticeRecordSaveMode({
      expertMode: false,
      normalShotCount: 0,
      expertArrowCount: 0,
      memo: "   ",
      attachmentCount: 0,
    })).toBe("empty");
  });

  it("메모 기록은 습사 통계에서 제외한다", () => {
    expect(isPracticeRound({ kind: "round" })).toBe(true);
    expect(isPracticeRound({ kind: "memo" })).toBe(false);
    expect(isPracticeRound({})).toBe(true);
  });
});

describe("로컬 미디어 첨부 제한", () => {
  const photo = { name: "target.jpg", type: "image/jpeg", size: 1024 } as File;

  it("사진·동영상·음성을 허용하고 유형을 분류한다", () => {
    expect(getRecordMediaValidationError(photo, 0)).toBeNull();
    expect(getRecordMediaKind("image/jpeg")).toBe("image");
    expect(getRecordMediaKind("video/mp4")).toBe("video");
    expect(getRecordMediaKind("audio/webm")).toBe("audio");
  });

  it("첨부 개수·파일 유형·용량 제한을 적용한다", () => {
    expect(getRecordMediaValidationError(photo, MAX_RECORD_MEDIA_ITEMS)).toContain("최대");
    expect(getRecordMediaValidationError({ name: "notes.pdf", type: "application/pdf", size: 100 } as File, 0)).toContain("사진·동영상·음성");
    expect(getRecordMediaValidationError({ name: "large.mp4", type: "video/mp4", size: MAX_RECORD_MEDIA_BYTES + 1 } as File, 0)).toContain("10MB");
    expect(formatRecordMediaSize(MAX_RECORD_MEDIA_BYTES)).toBe("10MB");
  });
});
