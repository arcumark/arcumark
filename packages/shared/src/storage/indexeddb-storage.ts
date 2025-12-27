import type { Timeline } from "../types/timeline.js";
import type { MediaRecord, StoredMediaRecord } from "../types/media.js";
import type { TimelineStorage } from "../types/storage.js";

const DB_NAME = "arcumark-media";
const DB_VERSION = 1;
const MEDIA_STORE = "media";
const LOCAL_PREFIX = "arcumark:timeline:";

export class IndexedDBStorage implements TimelineStorage {
	private openMediaDb(): Promise<IDBDatabase | null> {
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

	async getTimeline(projectId: string): Promise<Timeline | null> {
		if (typeof localStorage === "undefined") return null;

		try {
			const stored = localStorage.getItem(`${LOCAL_PREFIX}${projectId}`);
			if (!stored) return null;
			return JSON.parse(stored) as Timeline;
		} catch {
			return null;
		}
	}

	async saveTimeline(timeline: Timeline): Promise<void> {
		if (typeof localStorage === "undefined") return;

		try {
			localStorage.setItem(`${LOCAL_PREFIX}${timeline.id}`, JSON.stringify(timeline));
		} catch (error) {
			console.error("Failed to save timeline", error);
		}
	}

	async listTimelines(): Promise<Array<{ id: string; name: string }>> {
		if (typeof localStorage === "undefined") return [];

		const results: Array<{ id: string; name: string }> = [];

		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (!key || !key.startsWith(LOCAL_PREFIX)) continue;

				const stored = localStorage.getItem(key);
				if (!stored) continue;

				try {
					const timeline = JSON.parse(stored) as Timeline;
					results.push({ id: timeline.id, name: timeline.name });
				} catch {
					// Skip invalid entries
				}
			}
		} catch {
			// Ignore errors
		}

		return results.sort((a, b) => a.name.localeCompare(b.name));
	}

	async deleteTimeline(projectId: string): Promise<void> {
		if (typeof localStorage === "undefined") return;

		try {
			localStorage.removeItem(`${LOCAL_PREFIX}${projectId}`);
		} catch {
			// Ignore errors
		}
	}

	async timelineExists(projectId: string): Promise<boolean> {
		if (typeof localStorage === "undefined") return false;

		try {
			const stored = localStorage.getItem(`${LOCAL_PREFIX}${projectId}`);
			return stored !== null;
		} catch {
			return false;
		}
	}

	async getMedia(mediaId: string): Promise<MediaRecord | null> {
		const db = await this.openMediaDb();
		if (!db) return null;

		return new Promise((resolve, reject) => {
			const tx = db.transaction(MEDIA_STORE, "readonly");
			const req = tx.objectStore(MEDIA_STORE).get(mediaId);
			req.onsuccess = () => {
				const record = req.result as StoredMediaRecord | undefined;
				if (!record) {
					resolve(null);
					return;
				}
				resolve({
					id: record.id,
					name: record.name,
					type: record.type,
					durationSeconds: record.durationSeconds,
					blob: record.blob,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			};
			req.onerror = () => reject(req.error);
		});
	}

	async saveMedia(media: MediaRecord): Promise<void> {
		const db = await this.openMediaDb();
		if (!db) return;

		const record: StoredMediaRecord = {
			id: media.id,
			name: media.name,
			type: media.type,
			durationSeconds: media.durationSeconds,
			blob: media.blob!,
		};

		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(MEDIA_STORE, "readwrite");
			tx.objectStore(MEDIA_STORE).put(record);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async listMedia(projectId?: string): Promise<MediaRecord[]> {
		const db = await this.openMediaDb();
		if (!db) return [];

		return new Promise((resolve, reject) => {
			const tx = db.transaction(MEDIA_STORE, "readonly");
			const req = tx.objectStore(MEDIA_STORE).getAll();
			req.onsuccess = () => {
				const records = (req.result as StoredMediaRecord[]) ?? [];
				const mediaList = records.map((record) => ({
					id: record.id,
					name: record.name,
					type: record.type,
					durationSeconds: record.durationSeconds,
					blob: record.blob,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}));
				resolve(mediaList);
			};
			req.onerror = () => reject(req.error);
		});
	}

	async deleteMedia(mediaId: string): Promise<void> {
		const db = await this.openMediaDb();
		if (!db) return;

		return new Promise<void>((resolve, reject) => {
			const tx = db.transaction(MEDIA_STORE, "readwrite");
			tx.objectStore(MEDIA_STORE).delete(mediaId);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async close(): Promise<void> {
		// No cleanup needed for IndexedDB
	}
}
