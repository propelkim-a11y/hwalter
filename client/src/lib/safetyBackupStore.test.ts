import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createPortableBackup, readPortableBackup } from "./portableBackup";
import { getLatestSafetyBackupBlob, getLatestSafetyBackupInfo, saveLatestSafetyBackup } from "./safetyBackupStore";

describe("전체 복원 전 안전 백업 저장소", () => {
  it("현재 상태 ZIP을 최신 1개로 보관하고 메타데이터와 원본을 다시 읽는다", async () => {
    const first = await saveLatestSafetyBackup(new Blob(["first backup"], { type: "application/zip" }), { recordCount: 3, mediaCount: 2 });
    expect(first.recordCount).toBe(3);
    expect(first.mediaCount).toBe(2);

    await saveLatestSafetyBackup(new Blob(["latest backup"], { type: "application/zip" }), { recordCount: 5, mediaCount: 4 });
    expect(await getLatestSafetyBackupInfo()).toMatchObject({ recordCount: 5, mediaCount: 4 });
    expect(await (await getLatestSafetyBackupBlob())?.text()).toBe("latest backup");
  });

  it("안전 보관된 현재 상태 ZIP은 기존 전체 복원 형식으로 다시 읽을 수 있다", async () => {
    const archive = await createPortableBackup({
      records: [{ id: "safe-record", date: "2026-10-01T10:00:00.000Z", shots: [], hits: 0, memo: "복원 전 메모", kind: "memo" }],
      settings: { tree_name: "안전 나무" },
      media: [],
    });
    await saveLatestSafetyBackup(archive, { recordCount: 1, mediaCount: 0 });

    const restored = await readPortableBackup((await getLatestSafetyBackupBlob())!);
    expect(restored.manifest.records[0].memo).toBe("복원 전 메모");
    expect(restored.manifest.settings.tree_name).toBe("안전 나무");
  });
});
