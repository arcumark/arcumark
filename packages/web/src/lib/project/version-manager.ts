import type { Timeline } from "@arcumark/shared";

export interface ProjectVersion {
	id: string;
	timeline: Timeline;
	timestamp: number;
	description?: string;
	createdBy?: string;
}

export class VersionManager {
	private projectId: string;
	private maxVersions: number;

	constructor(projectId: string, maxVersions: number = 20) {
		this.projectId = projectId;
		this.maxVersions = maxVersions;
	}

	private getStorageKey(): string {
		return `arcumark:versions:${this.projectId}`;
	}

	saveVersion(timeline: Timeline, description?: string): string {
		const version: ProjectVersion = {
			id: `v${Date.now()}`,
			timeline: JSON.parse(JSON.stringify(timeline)), // Deep clone
			timestamp: Date.now(),
			description,
		};

		const versions = this.getVersions();
		versions.push(version);

		// Keep only the most recent versions
		if (versions.length > this.maxVersions) {
			versions.shift();
		}

		// Sort by timestamp (oldest first)
		versions.sort((a, b) => a.timestamp - b.timestamp);

		try {
			localStorage.setItem(this.getStorageKey(), JSON.stringify(versions));
		} catch (e) {
			console.error("Failed to save version", e);
		}

		return version.id;
	}

	getVersions(): ProjectVersion[] {
		try {
			const stored = localStorage.getItem(this.getStorageKey());
			if (!stored) return [];
			return JSON.parse(stored) as ProjectVersion[];
		} catch (e) {
			console.error("Failed to load versions", e);
			return [];
		}
	}

	getVersion(versionId: string): ProjectVersion | null {
		const versions = this.getVersions();
		return versions.find((v) => v.id === versionId) || null;
	}

	restoreVersion(versionId: string): Timeline | null {
		const version = this.getVersion(versionId);
		return version ? version.timeline : null;
	}

	deleteVersion(versionId: string): boolean {
		const versions = this.getVersions();
		const filtered = versions.filter((v) => v.id !== versionId);
		if (filtered.length === versions.length) return false;

		try {
			localStorage.setItem(this.getStorageKey(), JSON.stringify(filtered));
			return true;
		} catch (e) {
			console.error("Failed to delete version", e);
			return false;
		}
	}

	clearVersions(): void {
		try {
			localStorage.removeItem(this.getStorageKey());
		} catch (e) {
			console.error("Failed to clear versions", e);
		}
	}
}
