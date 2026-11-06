import { describe, expect, it } from "vitest";
import {
  createClubPersonalNotesSnapshot,
  parseClubPersonalNotesCsv,
  parseClubPersonalNotesJson,
  serializeClubPersonalNotesCsv,
  type ClubPersonalNotesData,
} from "@/lib/clubPersonalNotes";

const sample: ClubPersonalNotesData = {
  notes: { "대전 주몽정": "주차장은 뒤편\n근처 국수집 메모" },
  links: { "대전 주몽정": [{ id: "link-1", label: "국수집", url: "https://example.com/noodles" }] },
  media: { "대전 주몽정": [{ id: "media-1", name: "주차장.jpg", type: "image/jpeg", size: 1234, kind: "image" }] },
};

describe("clubPersonalNotes export/import", () => {
  it("CSV round-trip preserves multiline notes, links, and media metadata", () => {
    const restored = parseClubPersonalNotesCsv(serializeClubPersonalNotesCsv(sample));
    expect(restored.notes["대전 주몽정"]).toBe(sample.notes["대전 주몽정"]);
    expect(restored.links["대전 주몽정"][0]).toMatchObject({ label: "국수집", url: "https://example.com/noodles" });
    expect(restored.media["대전 주몽정"][0]).toMatchObject({ id: "media-1", name: "주차장.jpg", kind: "image" });
  });

  it("JSON snapshot round-trip preserves the export format and data", () => {
    const snapshot = createClubPersonalNotesSnapshot(sample);
    const restored = parseClubPersonalNotesJson(JSON.stringify(snapshot));
    expect(snapshot.format).toBe("hwalter-club-personal-notes");
    expect(snapshot.schemaVersion).toBe(1);
    expect(restored).toEqual(sample);
  });

  it("rejects JSON from an unrelated format", () => {
    expect(() => parseClubPersonalNotesJson(JSON.stringify({ notes: {} }))).toThrow("활터 왔소에서 내보낸 메모 JSON이 아닙니다.");
  });
});
