import Database from "better-sqlite3";
import path from "path";
import { homedir } from "os";
import type { Timeline } from "../types/timeline.js";
import type { MediaRecord } from "../types/media.js";
import type { TimelineStorage, StorageConfig } from "../types/storage.js";

export class SQLiteStorage implements TimelineStorage {
	private db: Database.Database;

	constructor(config: StorageConfig) {
		const dbPath = config.dbName || path.join(homedir(), ".arcumark", "arcumark.db");
		this.db = new Database(dbPath);
		this.initialize();
	}

	private initialize(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS timelines (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				duration REAL NOT NULL,
				tracks TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS media (
				id TEXT PRIMARY KEY,
				project_id TEXT,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				duration_seconds REAL NOT NULL,
				file_path TEXT,
				mime_type TEXT,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				FOREIGN KEY (project_id) REFERENCES timelines(id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_media_project ON media(project_id);
		`);
	}

	async getTimeline(projectId: string): Promise<Timeline | null> {
		const row = this.db
			.prepare("SELECT id, name, duration, tracks FROM timelines WHERE id = ?")
			.get(projectId) as { id: string; name: string; duration: number; tracks: string } | undefined;

		if (!row) return null;

		return {
			id: row.id,
			name: row.name,
			duration: row.duration,
			tracks: JSON.parse(row.tracks),
		};
	}

	async saveTimeline(timeline: Timeline): Promise<void> {
		const now = Date.now();
		const existing = await this.getTimeline(timeline.id);

		if (existing) {
			this.db
				.prepare(
					`UPDATE timelines
					SET name = ?, duration = ?, tracks = ?, updated_at = ?
					WHERE id = ?`
				)
				.run(timeline.name, timeline.duration, JSON.stringify(timeline.tracks), now, timeline.id);
		} else {
			this.db
				.prepare(
					`INSERT INTO timelines (id, name, duration, tracks, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?)`
				)
				.run(
					timeline.id,
					timeline.name,
					timeline.duration,
					JSON.stringify(timeline.tracks),
					now,
					now
				);
		}
	}

	async listTimelines(): Promise<Array<{ id: string; name: string }>> {
		const rows = this.db.prepare("SELECT id, name FROM timelines ORDER BY name").all() as Array<{
			id: string;
			name: string;
		}>;

		return rows;
	}

	async deleteTimeline(projectId: string): Promise<void> {
		this.db.prepare("DELETE FROM timelines WHERE id = ?").run(projectId);
	}

	async timelineExists(projectId: string): Promise<boolean> {
		const row = this.db.prepare("SELECT 1 FROM timelines WHERE id = ?").get(projectId) as
			| { 1: number }
			| undefined;

		return row !== undefined;
	}

	async getMedia(mediaId: string): Promise<MediaRecord | null> {
		const row = this.db
			.prepare(
				`SELECT id, project_id, name, type, duration_seconds, file_path, mime_type, created_at, updated_at
				FROM media WHERE id = ?`
			)
			.get(mediaId) as
			| {
					id: string;
					project_id: string | null;
					name: string;
					type: string;
					duration_seconds: number;
					file_path: string | null;
					mime_type: string | null;
					created_at: number;
					updated_at: number;
			  }
			| undefined;

		if (!row) return null;

		return {
			id: row.id,
			projectId: row.project_id || undefined,
			name: row.name,
			type: row.type as "video" | "audio" | "image",
			durationSeconds: row.duration_seconds,
			filePath: row.file_path || undefined,
			mimeType: row.mime_type || undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	async saveMedia(media: MediaRecord): Promise<void> {
		const now = Date.now();
		const existing = await this.getMedia(media.id);

		if (existing) {
			this.db
				.prepare(
					`UPDATE media
					SET project_id = ?, name = ?, type = ?, duration_seconds = ?,
						file_path = ?, mime_type = ?, updated_at = ?
					WHERE id = ?`
				)
				.run(
					media.projectId || null,
					media.name,
					media.type,
					media.durationSeconds,
					media.filePath || null,
					media.mimeType || null,
					now,
					media.id
				);
		} else {
			this.db
				.prepare(
					`INSERT INTO media (id, project_id, name, type, duration_seconds, file_path, mime_type, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					media.id,
					media.projectId || null,
					media.name,
					media.type,
					media.durationSeconds,
					media.filePath || null,
					media.mimeType || null,
					media.createdAt || now,
					media.updatedAt || now
				);
		}
	}

	async listMedia(projectId?: string): Promise<MediaRecord[]> {
		const query = projectId
			? "SELECT * FROM media WHERE project_id = ? ORDER BY name"
			: "SELECT * FROM media ORDER BY name";

		const rows = (
			projectId ? this.db.prepare(query).all(projectId) : this.db.prepare(query).all()
		) as Array<{
			id: string;
			project_id: string | null;
			name: string;
			type: string;
			duration_seconds: number;
			file_path: string | null;
			mime_type: string | null;
			created_at: number;
			updated_at: number;
		}>;

		return rows.map((row) => ({
			id: row.id,
			projectId: row.project_id || undefined,
			name: row.name,
			type: row.type as "video" | "audio" | "image",
			durationSeconds: row.duration_seconds,
			filePath: row.file_path || undefined,
			mimeType: row.mime_type || undefined,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	}

	async deleteMedia(mediaId: string): Promise<void> {
		this.db.prepare("DELETE FROM media WHERE id = ?").run(mediaId);
	}

	async close(): Promise<void> {
		this.db.close();
	}
}
