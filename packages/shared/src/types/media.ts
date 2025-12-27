export type MediaKind = "video" | "audio" | "image";

export type MediaRecord = {
	id: string;
	name: string;
	type: MediaKind;
	durationSeconds: number;
	projectId?: string;
	filePath?: string; // For file-based storage
	blob?: Blob; // For IndexedDB storage
	mimeType?: string;
	createdAt: number;
	updatedAt: number;
};

export type StoredMediaRecord = {
	id: string;
	name: string;
	type: MediaKind;
	icon?: MediaKind;
	durationSeconds: number;
	blob: Blob;
};
