import { describe, expect, it } from "vitest";
import {
  createPortableBackup,
  mergePortableBackup,
  readPortableBackup,
  PORTABLE_BACKUP_FORMAT,
} from "./portableBackup";
import type { StoredRecordMedia } from "./recordMediaStore";

const record = {
  id: "record-a",
  date: "2026-10-01T10:00:00.000Z",
  shots: [true, false, true, false, true],
  hits: 3,
  memo: "활 손 점검",
  kind: "round" as const,
  media: [{ id: "media-a", name: "target.jpg", type: "image/jpeg", size: 5, kind: "image" as const }],
};

const media: StoredRecordMedia = {
  ...record.media[0],
  recordId: record.id,
  createdAt: "2026-10-01T10:00:00.000Z",
  blob: new Blob(["image"], { type: "image/jpeg" }),
};

describe("기기 이전 ZIP 백업", () => {
  it("기록·설정·첨부 원본을 하나의 ZIP으로 만들어 다시 읽는다", async () => {
    const zip = await createPortableBackup({
      records: [record],
      settings: { tree_name: "주몽", hwalter_text_scale: "large" },
      media: [media],
    });

    const restored = await readPortableBackup(zip);
    expect(restored.manifest.format).toBe(PORTABLE_BACKUP_FORMAT);
    expect(restored.manifest.records).toEqual([record]);
    expect(restored.manifest.settings).toEqual({ tree_name: "주몽", hwalter_text_scale: "large" });
    expect(restored.media).toHaveLength(1);
    expect(restored.media[0].recordId).toBe("record-a");
    expect(await restored.media[0].blob.text()).toBe("image");
  });

  it("병합 복원은 중복 기록을 건너뛰고 ID 충돌이 나면 첨부 연결을 안전하게 새 ID로 바꾼다", async () => {
    const backup = await readPortableBackup(await createPortableBackup({
      records: [record],
      settings: {},
      media: [media],
    }));
    const existing = { ...record, memo: "다른 기록", media: [] };

    const merged = mergePortableBackup([existing], [], backup);
    expect(merged.addedRecordCount).toBe(1);
    expect(merged.skippedRecordCount).toBe(0);
    expect(merged.records).toHaveLength(2);
    const importedRecord = merged.records.find((item) => item.memo === "활 손 점검");
    expect(importedRecord?.id).not.toBe("record-a");
    expect(importedRecord?.media?.[0].id).toBe(merged.media[0].id);
    expect(merged.media[0].recordId).toBe(importedRecord?.id);

    const deduplicated = mergePortableBackup([record], [], backup);
    expect(deduplicated.addedRecordCount).toBe(0);
    expect(deduplicated.skippedRecordCount).toBe(1);
    expect(deduplicated.media).toHaveLength(0);
  });

  it("다른 파일 또는 손상된 ZIP을 복원 대상으로 거부한다", async () => {
    await expect(readPortableBackup(new Blob(["not zip"]))).rejects.toThrow("ZIP");
  });
});
