const DB_NAME = "hwalter-safety-backups";
const DB_VERSION = 1;
const STORE_NAME = "backups";
const LATEST_BACKUP_ID = "pre-replace-latest";

export type SafetyBackupInfo = {
  createdAt: string;
  recordCount: number;
  mediaCount: number;
  size: number;
};

type StoredSafetyBackup = SafetyBackupInfo & {
  id: typeof LATEST_BACKUP_ID;
  blob: Blob;
};

function openSafetyBackupDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("이 브라우저는 안전 백업 저장을 지원하지 않습니다."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("안전 백업 저장소를 열 수 없습니다."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("안전 백업 저장을 완료하지 못했습니다."));
    transaction.onabort = () => reject(transaction.error ?? new Error("안전 백업 저장이 취소되었습니다."));
  });
}

async function getStoredSafetyBackup(): Promise<StoredSafetyBackup | undefined> {
  const database = await openSafetyBackupDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(LATEST_BACKUP_ID);
    return await new Promise<StoredSafetyBackup | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredSafetyBackup | undefined);
      request.onerror = () => reject(request.error ?? new Error("안전 백업을 불러오지 못했습니다."));
    });
  } finally {
    database.close();
  }
}

export async function saveLatestSafetyBackup(blob: Blob, summary: Pick<SafetyBackupInfo, "recordCount" | "mediaCount">): Promise<SafetyBackupInfo> {
  const backup: StoredSafetyBackup = {
    id: LATEST_BACKUP_ID,
    blob,
    createdAt: new Date().toISOString(),
    recordCount: summary.recordCount,
    mediaCount: summary.mediaCount,
    size: blob.size,
  };
  const database = await openSafetyBackupDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(backup);
    await waitForTransaction(transaction);
    return toSafetyBackupInfo(backup);
  } finally {
    database.close();
  }
}

function toSafetyBackupInfo(backup: StoredSafetyBackup): SafetyBackupInfo {
  return {
    createdAt: backup.createdAt,
    recordCount: backup.recordCount,
    mediaCount: backup.mediaCount,
    size: backup.size,
  };
}

export async function getLatestSafetyBackupInfo(): Promise<SafetyBackupInfo | null> {
  const backup = await getStoredSafetyBackup();
  return backup ? toSafetyBackupInfo(backup) : null;
}

export async function getLatestSafetyBackupBlob(): Promise<Blob | null> {
  return (await getStoredSafetyBackup())?.blob ?? null;
}
