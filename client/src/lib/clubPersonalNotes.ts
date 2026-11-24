import { nanoid } from "nanoid";
import type { LocalRecordMedia } from "@/lib/recordMediaStore";

export type ClubPersonalLink = {
  id: string;
  label: string;
  url: string;
};

export type ClubPersonalNotesData = {
  notes: Record<string, string>;
  links: Record<string, ClubPersonalLink[]>;
  media: Record<string, LocalRecordMedia[]>;
};

export type ClubPersonalNotesSnapshot = ClubPersonalNotesData & {
  format: "hwalter-club-personal-notes";
  schemaVersion: 1;
  exportedAt: string;
};

export function createClubPersonalNotesSnapshot(data: ClubPersonalNotesData): ClubPersonalNotesSnapshot {
  return {
    format: "hwalter-club-personal-notes",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notes: data.notes,
    links: data.links,
    media: data.media,
  };
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function serializeClubPersonalNotesCsv(data: ClubPersonalNotesData): string {
  const names = Array.from(new Set([
    ...Object.keys(data.notes),
    ...Object.keys(data.links),
    ...Object.keys(data.media),
  ])).sort((a, b) => a.localeCompare(b, "ko"));
  const rows = [
    ["활터명", "개인메모", "웹링크(JSON)", "사진파일명(JSON)", "사진수"],
    ...names.map((name) => [
      name,
      data.notes[name] ?? "",
      JSON.stringify((data.links[name] ?? []).map(({ label, url }) => ({ label, url }))),
      JSON.stringify((data.media[name] ?? []).map(({ id, name: fileName, type, size, kind }) => ({ id, name: fileName, type, size, kind }))),
      String(data.media[name]?.length ?? 0),
    ]),
  ];
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

function parseCsvRows(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

function parseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function parseClubPersonalNotesCsv(text: string): ClubPersonalNotesData {
  const rows = parseCsvRows(text);
  if (rows.length < 2 || rows[0][0] !== "활터명") throw new Error("활터 메모 CSV 형식이 올바르지 않습니다.");
  const notes: Record<string, string> = {};
  const links: Record<string, ClubPersonalLink[]> = {};
  const media: Record<string, LocalRecordMedia[]> = {};
  rows.slice(1).forEach((row) => {
    const clubName = row[0]?.trim();
    if (!clubName) return;
    notes[clubName] = row[1] ?? "";
    links[clubName] = parseJsonArray<{ label?: string; url?: string }>(row[2] ?? "", [])
      .filter((link) => typeof link.url === "string" && link.url.trim())
      .map((link) => ({ id: nanoid(), label: String(link.label || link.url), url: String(link.url) }));
    media[clubName] = parseJsonArray<{ id?: string; name?: string; type?: string; size?: number; kind?: LocalRecordMedia["kind"] }>(row[3] ?? "", [])
      .filter((item) => typeof item.id === "string" && typeof item.name === "string")
      .map((item) => ({ id: item.id!, name: item.name!, type: item.type || "image/jpeg", size: Number(item.size) || 0, kind: item.kind === "image" ? "image" : "file" }));
  });
  return { notes, links, media };
}

export function parseClubPersonalNotesJson(text: string): ClubPersonalNotesData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("활터 메모 JSON 파일을 읽을 수 없습니다.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("활터 메모 JSON 형식이 올바르지 않습니다.");
  const snapshot = parsed as Partial<ClubPersonalNotesSnapshot>;
  if (snapshot.format !== "hwalter-club-personal-notes" || snapshot.schemaVersion !== 1) {
    throw new Error("활터 왔소에서 내보낸 메모 JSON이 아닙니다.");
  }
  return {
    notes: snapshot.notes && typeof snapshot.notes === "object" ? snapshot.notes : {},
    links: snapshot.links && typeof snapshot.links === "object" ? snapshot.links : {},
    media: snapshot.media && typeof snapshot.media === "object" ? snapshot.media : {},
  } as ClubPersonalNotesData;
}
