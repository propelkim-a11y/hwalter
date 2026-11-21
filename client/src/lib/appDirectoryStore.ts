const DB_NAME = "hwalter-app-directory";
const STORE_NAME = "handles";
const HANDLE_KEY = "hwalter-directory";

type PermissionMode = "read" | "readwrite";
type DirectoryHandleLike = {
  kind: "directory";
  name: string;
  queryPermission?: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: PermissionMode }) => Promise<PermissionState>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
};

type FilePickerWindow = Window & {
  showDirectoryPicker?: (options?: { id?: string; mode?: PermissionMode }) => Promise<DirectoryHandleLike>;
  showOpenFilePicker?: (options?: {
    id?: string;
    startIn?: DirectoryHandleLike;
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<Array<{ getFile: () => Promise<File> }>>;
};

const canUseFileSystemAccess = () => typeof window !== "undefined" && "indexedDB" in window && Boolean((window as FilePickerWindow).showDirectoryPicker);

const openDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("파일 폴더 저장소를 열 수 없습니다."));
});

const readHandle = async (): Promise<DirectoryHandleLike | null> => {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
};

const writeHandle = async (handle: DirectoryHandleLike): Promise<void> => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const ensurePermission = async (handle: DirectoryHandleLike, mode: PermissionMode): Promise<boolean> => {
  const descriptor = { mode };
  if (handle.queryPermission && await handle.queryPermission(descriptor) === "granted") return true;
  if (handle.requestPermission) return await handle.requestPermission(descriptor) === "granted";
  return true;
};

export const isAppDirectorySupported = () => canUseFileSystemAccess();

export const getAppDirectoryName = async (): Promise<string | null> => (await readHandle())?.name ?? null;

export const chooseAppDirectory = async (): Promise<string | null> => {
  if (!canUseFileSystemAccess()) return null;
  const picker = (window as FilePickerWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    const handle = await picker({ id: "hwalter", mode: "readwrite" });
    if (!(await ensurePermission(handle, "readwrite"))) throw new Error("폴더 사용 권한을 허용해 주세요.");
    await writeHandle(handle);
    return handle.name;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
};

export const saveToAppDirectory = async (blob: Blob, filename: string): Promise<boolean> => {
  if (!canUseFileSystemAccess()) return false;
  let handle = await readHandle();
  if (!handle) {
    await chooseAppDirectory();
    handle = await readHandle();
  }
  if (!handle || !(await ensurePermission(handle, "readwrite"))) return false;
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
};

export const openFromAppDirectory = async (accept: Record<string, string[]>): Promise<File | null> => {
  if (!canUseFileSystemAccess()) return null;
  let handle = await readHandle();
  if (!handle) {
    await chooseAppDirectory();
    handle = await readHandle();
  }
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (!handle || !picker || !(await ensurePermission(handle, "read"))) return null;
  try {
    const [fileHandle] = await picker({ id: "hwalter", startIn: handle, multiple: false, types: [{ description: "활터왔소 파일", accept }] });
    return fileHandle ? await fileHandle.getFile() : null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
};
