export type PracticeRecordKind = "round" | "memo";

export type PracticeRecordLike = {
  kind?: PracticeRecordKind;
};

export type PracticeRecordSaveMode = "round" | "memo" | "invalid-partial" | "empty";

export type PracticeRecordSaveInput = {
  expertMode: boolean;
  normalShotCount: number;
  expertArrowCount: number;
  memo: string;
  attachmentCount: number;
};

export const MAX_RECORD_MEDIA_ITEMS = 3;
export const MAX_RECORD_MEDIA_BYTES = 10 * 1024 * 1024;
export const RECORD_MEDIA_ACCEPT = "image/*,video/*,audio/*";

export type RecordMediaCandidate = Pick<File, "name" | "size" | "type">;

export function getPracticeRecordSaveMode({
  expertMode,
  normalShotCount,
  expertArrowCount,
  memo,
  attachmentCount,
}: PracticeRecordSaveInput): PracticeRecordSaveMode {
  const shotCount = expertMode ? expertArrowCount : normalShotCount;
  const hasMemoOrMedia = Boolean(memo.trim()) || attachmentCount > 0;

  if (shotCount === 5) return "round";
  if (shotCount === 0) return hasMemoOrMedia ? "memo" : "empty";
  return "invalid-partial";
}

export function isPracticeRound(record: PracticeRecordLike): boolean {
  return record.kind !== "memo";
}

export function getRecordMediaValidationError(file: RecordMediaCandidate, currentCount: number): string | null {
  if (currentCount >= MAX_RECORD_MEDIA_ITEMS) {
    return `첨부는 최대 ${MAX_RECORD_MEDIA_ITEMS}개까지 가능합니다.`;
  }
  if (!file.type || !/^(image|video|audio)\//.test(file.type)) {
    return "사진·동영상·음성 파일만 첨부할 수 있습니다.";
  }
  if (file.size > MAX_RECORD_MEDIA_BYTES) {
    return `파일 1개는 ${formatRecordMediaSize(MAX_RECORD_MEDIA_BYTES)} 이하만 첨부할 수 있습니다.`;
  }
  return null;
}

export function getRecordMediaKind(type: string): "image" | "video" | "audio" | "file" {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "file";
}

export function formatRecordMediaSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}
