import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { clearRecordMedia, deleteRecordMedia, getAllRecordMedia, getRecordMediaBlob, restoreRecordMedia, saveRecordMedia } from "./recordMediaStore";

afterEach(async () => {
  await clearRecordMedia();
});

describe("기기 내 습사 기록 미디어 저장소", () => {
  it("첨부 파일을 IndexedDB에 저장한 뒤 다시 읽고 삭제할 수 있다", async () => {
    const image = new File(["local-photo"], "target.jpg", { type: "image/jpeg" });
    const [attachment] = await saveRecordMedia("record-1", [image]);

    expect(attachment.name).toBe("target.jpg");
    expect(attachment.kind).toBe("image");

    const savedBlob = await getRecordMediaBlob(attachment.id);
    expect(savedBlob).toBeDefined();
    expect(await savedBlob?.text()).toBe("local-photo");

    await deleteRecordMedia([attachment.id]);
    expect(await getRecordMediaBlob(attachment.id)).toBeUndefined();
  });

  it("전체 첨부 원본을 읽어 새 기기에 복원하는 형태로 다시 저장할 수 있다", async () => {
    const [attachment] = await saveRecordMedia("record-2", [new File(["backup-photo"], "backup.jpg", { type: "image/jpeg" })]);
    const exported = await getAllRecordMedia();
    expect(exported).toHaveLength(1);

    await clearRecordMedia();
    await restoreRecordMedia(exported, { replace: true });
    expect(await getRecordMediaBlob(attachment.id)).toBeDefined();
    expect(await (await getRecordMediaBlob(attachment.id))?.text()).toBe("backup-photo");
  });
});
