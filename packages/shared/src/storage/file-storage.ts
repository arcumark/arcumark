import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";
import type { Timeline } from "../types/timeline.js";
import type { MediaRecord } from "../types/media.js";
import type { TimelineStorage, StorageConfig } from "../types/storage.js";

export class FileStorage implements TimelineStorage {
	private basePath: string;

	constructor(config: StorageConfig) {
		this.basePath =
			config.basePath?.replace("~", homedir()) || path.join(homedir(), ".arcumark", "projects");
	}

	private async ensureDir(dir: string): Promise<void> {
		await fs.mkdir(dir, { recursive: true });
	}

	private getProjectPath(projectId: string): string {
		return path.join(this.basePath, projectId);
	}

	private getTimelinePath(projectId: string): string {
		return path.join(this.getProjectPath(projectId), "timeline.json");
	}

	private getMediaDir(projectId: string): string {
		return path.join(this.getProjectPath(projectId), "media");
	}

	private getMediaMetadataPath(projectId: string): string {
		return path.join(this.getMediaDir(projectId), "metadata.json");
	}

	async getTimeline(projectId: string): Promise<Timeline | null> {
		try {
			const content = await fs.readFile(this.getTimelinePath(projectId), "utf-8");
			return JSON.parse(content) as Timeline;
		} catch {
			return null;
		}
	}

	async saveTimeline(timeline: Timeline): Promise<void> {
		const projectPath = this.getProjectPath(timeline.id);
		await this.ensureDir(projectPath);
		await fs.writeFile(this.getTimelinePath(timeline.id), JSON.stringify(timeline, null, 2));
	}

	async listTimelines(): Promise<Array<{ id: string; name: string }>> {
		try {
			await this.ensureDir(this.basePath);
			const entries = await fs.readdir(this.basePath, { withFileTypes: true });
			const results: Array<{ id: string; name: string }> = [];

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const timeline = await this.getTimeline(entry.name);
					if (timeline) {
						results.push({ id: timeline.id, name: timeline.name });
					}
				}
			}

			return results;
		} catch {
			return [];
		}
	}

	async deleteTimeline(projectId: string): Promise<void> {
		const projectPath = this.getProjectPath(projectId);
		try {
			await fs.rm(projectPath, { recursive: true, force: true });
		} catch {
			// Ignore errors
		}
	}

	async timelineExists(projectId: string): Promise<boolean> {
		try {
			await fs.access(this.getTimelinePath(projectId));
			return true;
		} catch {
			return false;
		}
	}

	async getMedia(mediaId: string): Promise<MediaRecord | null> {
		// Search all projects for this media
		const projects = await this.listTimelines();
		for (const project of projects) {
			const mediaList = await this.listMedia(project.id);
			const media = mediaList.find((m) => m.id === mediaId);
			if (media) return media;
		}
		return null;
	}

	async saveMedia(media: MediaRecord): Promise<void> {
		if (!media.projectId) {
			throw new Error("projectId is required for file-based storage");
		}

		const mediaDir = this.getMediaDir(media.projectId);
		await this.ensureDir(mediaDir);

		// Load existing metadata
		let metadata: MediaRecord[] = [];
		try {
			const content = await fs.readFile(this.getMediaMetadataPath(media.projectId), "utf-8");
			metadata = JSON.parse(content);
		} catch {
			// File doesn't exist yet
		}

		// Update or add media record
		const index = metadata.findIndex((m) => m.id === media.id);
		if (index >= 0) {
			metadata[index] = media;
		} else {
			metadata.push(media);
		}

		// Save metadata
		await fs.writeFile(
			this.getMediaMetadataPath(media.projectId),
			JSON.stringify(metadata, null, 2)
		);
	}

	async listMedia(projectId?: string): Promise<MediaRecord[]> {
		if (!projectId) {
			// List all media across all projects
			const projects = await this.listTimelines();
			const allMedia: MediaRecord[] = [];
			for (const project of projects) {
				const media = await this.listMedia(project.id);
				allMedia.push(...media);
			}
			return allMedia;
		}

		try {
			const content = await fs.readFile(this.getMediaMetadataPath(projectId), "utf-8");
			return JSON.parse(content) as MediaRecord[];
		} catch {
			return [];
		}
	}

	async deleteMedia(mediaId: string): Promise<void> {
		const media = await this.getMedia(mediaId);
		if (!media || !media.projectId) return;

		const mediaList = await this.listMedia(media.projectId);
		const updated = mediaList.filter((m) => m.id !== mediaId);

		await fs.writeFile(
			this.getMediaMetadataPath(media.projectId),
			JSON.stringify(updated, null, 2)
		);

		// Delete media file if it exists
		if (media.filePath) {
			try {
				await fs.unlink(media.filePath);
			} catch {
				// Ignore errors
			}
		}
	}

	async close(): Promise<void> {
		// No cleanup needed for file storage
	}
}
