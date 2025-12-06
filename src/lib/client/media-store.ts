"use client";

type MediaKind = "video" | "audio" | "image";

export type StoredMediaRecord = {
	id: string;
	name: string;
	type: MediaKind;
	icon?: MediaKind;
	durationSeconds: number;
	blob: Blob;
};

const DB_NAME = "arcumark-media";
const DB_VERSION = 1;
const MEDIA_STORE = "media";

export function openMediaDb(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(MEDIA_STORE)) {
				db.createObjectStore(MEDIA_STORE, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

export async function saveMediaRecord(record: StoredMediaRecord) {
	const db = await openMediaDb();
	if (!db) return;
	return new Promise<void>((resolve, reject) => {
		const tx = db.transaction(MEDIA_STORE, "readwrite");
		tx.objectStore(MEDIA_STORE).put(record);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function readAllMediaRecords(): Promise<StoredMediaRecord[]> {
	const db = await openMediaDb();
	if (!db) return [];
	return new Promise((resolve, reject) => {
		const tx = db.transaction(MEDIA_STORE, "readonly");
		const req = tx.objectStore(MEDIA_STORE).getAll();
		req.onsuccess = () => resolve((req.result as StoredMediaRecord[]) ?? []);
		req.onerror = () => reject(req.error);
	});
}

export async function updateMediaDuration(id: string, durationSeconds: number) {
	const db = await openMediaDb();
	if (!db) return;
	return new Promise<void>((resolve, reject) => {
		const tx = db.transaction(MEDIA_STORE, "readwrite");
		const store = tx.objectStore(MEDIA_STORE);
		const getReq = store.get(id);
		getReq.onsuccess = () => {
			const record = getReq.result as StoredMediaRecord | undefined;
			if (!record) return resolve();
			store.put({ ...record, durationSeconds });
			tx.oncomplete = () => resolve();
		};
		tx.onerror = () => reject(tx.error);
	});
}
