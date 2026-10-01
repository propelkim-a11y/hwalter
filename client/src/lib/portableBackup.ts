import JSZip from "jszip";
import { nanoid } from "nanoid";
import type { LocalRecordMedia, StoredRecordMedia } from "@/lib/recordMediaStore";

export const PORTABLE_BACKUP_FORMAT = "hwalter-portable-backup";
export const PORTABLE_BACKUP_SCHEMA_VERSION = 1;
const MANIFEST_PATH = "hwalter-backup.json";
const MEDIA_DIRECTORY = "media/";

export type PortablePracticeRecord = {
  id: string;
  date: string;
  shots: (boolean | null)[];
  hits: number;
  memo: string;
  kind?: "round" | "memo";
  media?: LocalRecordMedia[];
  lat?: number;
  lng?: number;
  clubName?: string;
  positions?: number[][][];
};

export type PortableMediaManifest = Omit<StoredRecordMedia, "blob"> & {
  path: string;
};

export type PortableBackupManifest = {
  format: typeof PORTABLE_BACKUP_FORMAT;
  schemaVersion: typeof PORTABLE_BACKUP_SCHEMA_VERSION;
  createdAt: string;
  records: PortablePracticeRecord[];
  settings: Record<string, string>;
  media: PortableMediaManifest[];
};

export type PortableBackup = {
  manifest: PortableBackupManifest;
  media: StoredRecordMedia[];
};

export type PortableBackupInput = {
  records: PortablePracticeRecord[];
  settings: Record<string, string>;
  media: StoredRecordMedia[];
};

export type PortableMergeResult = {
  records: PortablePracticeRecord[];
  media: StoredRecordMedia[];
  addedRecordCount: number;
  skippedRecordCount: number;
};

function normalizeRecord(record: PortablePracticeRecord): PortablePracticeRecord {
  return {
    ...record,
    id: String(record.id || nanoid()),
    date: String(record.date || new Date().toISOString()),
    shots: Array.isArray(record.shots) ? record.shots : [],
    hits: Number.isFinite(record.hits) ? record.hits : 0,
    memo: typeof record.memo === "string" ? record.memo : "",
    kind: record.kind === "memo" ? "memo" : "round",
    media: Array.isArray(record.media) ? record.media : [],
    positions: Array.isArray(record.positions) ? record.positions : undefined,
  };
}

function recordFingerprint(record: PortablePracticeRecord): string {
  const normalized = normalizeRecord(record);
  return [
    normalized.date,
    normalized.kind,
    normalized.hits,
    normalized.shots.join(","),
    normalized.memo,
    normalized.clubName ?? "",
    normalized.lat ?? "",
    normalized.lng ?? "",
  ].join("|");
}

function safeMediaPath(id: string): string {
  return `${MEDIA_DIRECTORY}${id}`;
}

function isSettings(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.values(value as Record<string, unknown>).every((item) => typeof item === "string");
}

export async function createPortableBackup({ records, settings, media }: PortableBackupInput): Promise<Blob> {
  const zip = new JSZip();
  const mediaManifest: PortableMediaManifest[] = [];

  media.forEach((attachment) => {
    const path = safeMediaPath(attachment.id);
    zip.file(path, attachment.blob);
    mediaManifest.push({
      id: attachment.id,
      recordId: attachment.recordId,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
      createdAt: attachment.createdAt,
      path,
    });
  });

  const manifest: PortableBackupManifest = {
    format: PORTABLE_BACKUP_FORMAT,
    schemaVersion: PORTABLE_BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    records: records.map(normalizeRecord),
    settings: { ...settings },
    media: mediaManifest,
  };

  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function readPortableBackup(file: Blob): Promise<PortableBackup> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("유효한 ZIP 파일이 아닙니다.");
  }

  const manifestFile = zip.file(MANIFEST_PATH);
  if (!manifestFile) throw new Error("활터 왔소 백업 파일을 찾을 수 없습니다.");

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await manifestFile.async("text"));
  } catch {
    throw new Error("백업 정보 파일을 읽을 수 없습니다.");
  }

  if (!rawManifest || typeof rawManifest !== "object") throw new Error("백업 정보 형식이 올바르지 않습니다.");
  const manifest = rawManifest as Partial<PortableBackupManifest>;
  if (manifest.format !== PORTABLE_BACKUP_FORMAT) throw new Error("활터 왔소에서 만든 백업 ZIP이 아닙니다.");
  if (manifest.schemaVersion !== PORTABLE_BACKUP_SCHEMA_VERSION) throw new Error("지원하지 않는 백업 버전입니다.");
  if (!Array.isArray(manifest.records) || !Array.isArray(manifest.media) || !isSettings(manifest.settings)) {
    throw new Error("백업 파일의 데이터 구조가 올바르지 않습니다.");
  }

  const normalizedRecords = manifest.records.map(normalizeRecord);
  const media: StoredRecordMedia[] = [];
  for (const entry of manifest.media) {
    if (!entry || typeof entry !== "object" || typeof entry.path !== "string" || typeof entry.id !== "string" || typeof entry.recordId !== "string") {
      throw new Error("백업의 첨부 정보가 올바르지 않습니다.");
    }
    const mediaFile = zip.file(entry.path);
    if (!mediaFile) throw new Error(`첨부 파일을 찾을 수 없습니다: ${entry.name || entry.id}`);
    media.push({
      id: entry.id,
      recordId: entry.recordId,
      name: typeof entry.name === "string" ? entry.name : "첨부 파일",
      type: typeof entry.type === "string" ? entry.type : "",
      size: typeof entry.size === "number" ? entry.size : 0,
      kind: entry.kind === "image" || entry.kind === "video" || entry.kind === "audio" ? entry.kind : "file",
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
      blob: await mediaFile.async("blob"),
    });
  }

  return {
    manifest: {
      format: PORTABLE_BACKUP_FORMAT,
      schemaVersion: PORTABLE_BACKUP_SCHEMA_VERSION,
      createdAt: typeof manifest.createdAt === "string" ? manifest.createdAt : "",
      records: normalizedRecords,
      settings: manifest.settings,
      media: manifest.media as PortableMediaManifest[],
    },
    media,
  };
}

export function mergePortableBackup(
  existingRecords: PortablePracticeRecord[],
  existingMedia: StoredRecordMedia[],
  backup: PortableBackup,
): PortableMergeResult {
  const resultRecords = existingRecords.map(normalizeRecord);
  const existingFingerprints = new Set(resultRecords.map(recordFingerprint));
  const existingRecordIds = new Set(resultRecords.map((record) => record.id));
  const existingMediaIds = new Set(existingMedia.map((attachment) => attachment.id));
  const recordIdMap = new Map<string, string>();
  const mediaIdMap = new Map<string, string>();
  const acceptedOriginalRecordIds = new Set<string>();
  const addedRecordIds = new Set<string>();
  let addedRecordCount = 0;
  let skippedRecordCount = 0;

  for (const sourceRecord of backup.manifest.records) {
    const record = normalizeRecord(sourceRecord);
    const fingerprint = recordFingerprint(record);
    if (existingFingerprints.has(fingerprint)) {
      skippedRecordCount += 1;
      continue;
    }
    const originalId = record.id;
    if (existingRecordIds.has(record.id)) record.id = nanoid();
    recordIdMap.set(originalId, record.id);
    existingRecordIds.add(record.id);
    existingFingerprints.add(fingerprint);
    acceptedOriginalRecordIds.add(originalId);
    addedRecordIds.add(record.id);
    resultRecords.push(record);
    addedRecordCount += 1;
  }

  const acceptedMedia = backup.media
    .filter((attachment) => acceptedOriginalRecordIds.has(attachment.recordId))
    .map((attachment) => {
      const originalId = attachment.id;
      const nextId = existingMediaIds.has(originalId) ? nanoid() : originalId;
      mediaIdMap.set(originalId, nextId);
      existingMediaIds.add(nextId);
      return { ...attachment, id: nextId, recordId: recordIdMap.get(attachment.recordId) ?? attachment.recordId };
    });

  const reconciledRecords = resultRecords.map((record) => {
    if (!addedRecordIds.has(record.id)) return record;
    const originalRecord = backup.manifest.records.find((candidate) => candidate.id === record.id || recordIdMap.get(candidate.id) === record.id);
    if (!originalRecord) return record;
    return {
      ...record,
      media: (record.media ?? []).map((attachment) => ({ ...attachment, id: mediaIdMap.get(attachment.id) ?? attachment.id })),
    };
  });

  return {
    records: reconciledRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    media: acceptedMedia,
    addedRecordCount,
    skippedRecordCount,
  };
}

export function formatPortableBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
