import type { Timeline } from "./timeline.js";
import type { MediaRecord } from "./media.js";

export interface TimelineStorage {
	// Timeline operations
	getTimeline(projectId: string): Promise<Timeline | null>;
	saveTimeline(timeline: Timeline): Promise<void>;
	listTimelines(): Promise<Array<{ id: string; name: string }>>;
	deleteTimeline(projectId: string): Promise<void>;
	timelineExists(projectId: string): Promise<boolean>;

	// Media operations
	getMedia(mediaId: string): Promise<MediaRecord | null>;
	saveMedia(media: MediaRecord): Promise<void>;
	listMedia(projectId?: string): Promise<MediaRecord[]>;
	deleteMedia(mediaId: string): Promise<void>;

	// Lifecycle
	close(): Promise<void>;
}

export interface StorageConfig {
	type: "file" | "sqlite" | "indexeddb";
	basePath?: string; // For file/sqlite storage
	dbName?: string; // For sqlite/indexeddb
}
