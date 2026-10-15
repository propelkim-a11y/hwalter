import { nanoid } from "nanoid";
import { getRecordMediaKind } from "@/lib/practiceRecord";

const DB_NAME = "hwalter-record-media";
const DB_VERSION = 1;
const STORE_NAME = "media";

export type LocalRecordMedia = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "video" | "audio" | "file";
};

export type StoredRecordMedia = LocalRecordMedia & {
  recordId: string;
  blob: Blob;
  createdAt: string;
};

function openMediaDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저는 기기 내 미디어 저장을 지원하지 않습니다."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("미디어 저장소를 열 수 없습니다."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("recordId", "recordId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("미디어 저장 작업을 완료하지 못했습니다."));
    transaction.onabort = () => reject(transaction.error ?? new Error("미디어 저장 작업이 취소되었습니다."));
  });
}

export async function saveRecordMedia(recordId: string, files: File[]): Promise<LocalRecordMedia[]> {
  if (files.length === 0) return [];

  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const attachments = files.map<LocalRecordMedia>((file) => ({
      id: nanoid(),
      name: file.name || "첨부 파일",
      type: file.type,
      size: file.size,
      kind: getRecordMediaKind(file.type),
    }));

    attachments.forEach((attachment, index) => {
      const stored: StoredRecordMedia = {
        ...attachment,
        recordId,
        blob: files[index],
        createdAt: new Date().toISOString(),
      };
      store.put(stored);
    });
    await waitForTransaction(transaction);
    return attachments;
  } finally {
    database.close();
  }
}

export async function getRecordMediaBlob(id: string): Promise<Blob | undefined> {
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    const result = await new Promise<StoredRecordMedia | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredRecordMedia | undefined);
      request.onerror = () => reject(request.error ?? new Error("첨부 파일을 불러오지 못했습니다."));
    });
    return result?.blob;
  } finally {
    database.close();
  }
}

export async function getAllRecordMedia(): Promise<StoredRecordMedia[]> {
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    return await new Promise<StoredRecordMedia[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredRecordMedia[]);
      request.onerror = () => reject(request.error ?? new Error("첨부 파일을 불러오지 못했습니다."));
    });
  } finally {
    database.close();
  }
}

export async function deleteRecordMedia(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function clearRecordMedia(): Promise<void> {
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function restoreRecordMedia(items: StoredRecordMedia[], options: { replace?: boolean } = {}): Promise<void> {
  if (items.length === 0 && !options.replace) return;
  const database = await openMediaDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (options.replace) store.clear();
    items.forEach((item) => store.put(item));
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export function getRecordMediaSummary(kind: LocalRecordMedia["kind"]): string {
  if (kind === "image") return "사진";
  if (kind === "video") return "동영상";
  if (kind === "audio") return "음성";
  return "파일";
}
