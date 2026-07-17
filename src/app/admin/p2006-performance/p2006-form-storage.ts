"use client";

type FormPageId = "page-1" | "page-2";

type StoredPageRecord = {
  id: FormPageId;
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  savedAt: string;
};

const DB_NAME = "briefings-p2006-form-upload-v2";
const DB_VERSION = 1;
const DB_STORE = "pages";
const DEFAULT_WIDTH = 1191;
const DEFAULT_HEIGHT = 1684;

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("Local browser storage is unavailable."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DB_STORE)) {
        database.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open P2006T form storage."));
  });
}

function readPage(database: IDBDatabase, id: FormPageId) {
  return new Promise<StoredPageRecord | null>((resolve) => {
    try {
      const transaction = database.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(id);
      request.onsuccess = () =>
        resolve((request.result as StoredPageRecord | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read bundled P2006T form page."));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read bundled P2006T form page."));
    reader.readAsDataURL(blob);
  });
}

async function bundledPage(id: FormPageId): Promise<StoredPageRecord> {
  const pageNumber = id === "page-1" ? 1 : 2;
  const response = await fetch(`/api/p2006-form-page-${pageNumber}`, {
    cache: "force-cache",
  });

  if (!response.ok) {
    throw new Error(`Bundled P2006T form page ${pageNumber} is unavailable.`);
  }

  return {
    id,
    dataUrl: await blobToDataUrl(await response.blob()),
    fileName: "RVP.CFI.071.02 Tecnam P2006T M&B and Performance Data Sheet.pdf",
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    savedAt: new Date().toISOString(),
  };
}

function savePages(database: IDBDatabase, pages: StoredPageRecord[]) {
  if (!pages.length) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, "readwrite");
    const store = transaction.objectStore(DB_STORE);
    pages.forEach((page) => store.put(page));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not save bundled P2006T form pages."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Saving bundled P2006T form pages was interrupted."));
  });
}

/**
 * Ensures that both official form-page backgrounds exist in IndexedDB.
 * Existing user-uploaded pages are preserved and are never overwritten.
 */
export async function ensureBundledP2006Form() {
  const database = await openDatabase();

  try {
    const [pageOne, pageTwo] = await Promise.all([
      readPage(database, "page-1"),
      readPage(database, "page-2"),
    ]);

    const missing: FormPageId[] = [];
    if (!pageOne?.dataUrl) missing.push("page-1");
    if (!pageTwo?.dataUrl) missing.push("page-2");
    if (!missing.length) return;

    const pages = await Promise.all(missing.map(bundledPage));
    await savePages(database, pages);
  } finally {
    database.close();
  }
}
