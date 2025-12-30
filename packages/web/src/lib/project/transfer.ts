"use client";

import type { Timeline } from "@arcumark/shared";
import type { StoredMediaRecord } from "@/lib/client/media-store";

export const PROJECT_EXPORT_VERSION = 1;

const EXPORT_MAGIC = "AMK1";
const MAGIC_BYTES = new TextEncoder().encode(EXPORT_MAGIC);
const HEADER_SIZE = MAGIC_BYTES.length + 4;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export type ExportedMedia = {
	id: string;
	name: string;
	type: StoredMediaRecord["type"];
	durationSeconds: number;
	dataUrl: string;
};

export type ProjectExportPayload = {
	version: typeof PROJECT_EXPORT_VERSION;
	exportedAt: string;
	app: "arcumark";
	project: {
		timeline: Timeline;
		media: ExportedMedia[];
	};
};

export type ProjectExportMediaEntry = {
	id: string;
	name: string;
	type: StoredMediaRecord["type"];
	durationSeconds: number;
	byteLength: number;
};

export type ProjectExportManifest = {
	version: typeof PROJECT_EXPORT_VERSION;
	exportedAt: string;
	app: "arcumark";
	project: {
		timeline: Timeline;
		media: ProjectExportMediaEntry[];
	};
};

export type ProjectImportPayload = {
	manifest: ProjectExportManifest;
	timeline: Timeline;
	media: Array<ProjectExportMediaEntry & { blob: Blob }>;
	source: "binary" | "json";
};

export async function buildProjectExportPackage(
	timeline: Timeline,
	records: StoredMediaRecord[]
): Promise<{ manifest: ProjectExportManifest; blob: Blob }> {
	const media = records.map((record) => ({
		id: record.id,
		name: record.name,
		type: record.type,
		durationSeconds: record.durationSeconds,
		byteLength: record.blob.size,
	}));
	const manifest: ProjectExportManifest = {
		version: PROJECT_EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		app: "arcumark",
		project: {
			timeline,
			media,
		},
	};
	const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
	const header = new Uint8Array(HEADER_SIZE);
	header.set(MAGIC_BYTES, 0);
	new DataView(header.buffer).setUint32(MAGIC_BYTES.length, manifestBytes.length, true);
	const blob = new Blob([header, manifestBytes, ...records.map((record) => record.blob)], {
		type: "application/x-arcumark",
	});
	return { manifest, blob };
}

export async function readProjectExportFile(file: File): Promise<ProjectImportPayload> {
	const headerBuffer = await file.slice(0, HEADER_SIZE).arrayBuffer();
	const headerBytes = new Uint8Array(headerBuffer);
	const magic = textDecoder.decode(headerBytes.slice(0, MAGIC_BYTES.length));

	if (magic === EXPORT_MAGIC) {
		const view = new DataView(headerBuffer, MAGIC_BYTES.length, 4);
		const manifestLength = view.getUint32(0, true);
		if (HEADER_SIZE + manifestLength > file.size) {
			throw new Error("Export file is truncated.");
		}
		const manifestBuffer = await file
			.slice(HEADER_SIZE, HEADER_SIZE + manifestLength)
			.arrayBuffer();
		const manifestJson = textDecoder.decode(new Uint8Array(manifestBuffer));
		const manifest = assertExportManifest(JSON.parse(manifestJson) as ProjectExportManifest);
		let offset = HEADER_SIZE + manifestLength;
		const media = manifest.project.media.map((entry) => {
			const end = offset + entry.byteLength;
			if (end > file.size) {
				throw new Error("Export file is truncated.");
			}
			const blob = file.slice(offset, end, entry.type);
			offset = end;
			return { ...entry, blob };
		});
		return {
			manifest,
			timeline: manifest.project.timeline,
			media,
			source: "binary",
		};
	}

	const legacyText = await file.text();
	const payload = parseProjectExportPayload(legacyText);
	const media = payload.project.media.map((record) => {
		const blob = dataUrlToBlob(record.dataUrl);
		return {
			id: record.id,
			name: record.name,
			type: record.type,
			durationSeconds: record.durationSeconds,
			byteLength: blob.size,
			blob,
		};
	});
	const manifest: ProjectExportManifest = {
		version: payload.version,
		exportedAt: payload.exportedAt,
		app: payload.app,
		project: {
			timeline: payload.project.timeline,
			media: media.map(({ blob, ...entry }) => ({
				...entry,
				byteLength: blob.size,
			})),
		},
	};
	return {
		manifest,
		timeline: payload.project.timeline,
		media,
		source: "json",
	};
}

export function parseProjectExportPayload(raw: string): ProjectExportPayload {
	const parsed = JSON.parse(raw) as ProjectExportPayload;
	if (!parsed || parsed.version !== PROJECT_EXPORT_VERSION || parsed.app !== "arcumark") {
		throw new Error("Unsupported export format.");
	}
	if (!parsed.project?.timeline || !Array.isArray(parsed.project.media)) {
		throw new Error("Export file is missing project data.");
	}
	return parsed;
}

export function dataUrlToBlob(dataUrl: string): Blob {
	const [header, base64] = dataUrl.split(",");
	if (!header || !base64) {
		throw new Error("Invalid media data URL.");
	}
	const match = header.match(/data:(.*?);base64/);
	const type = match?.[1] ?? "application/octet-stream";
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Blob([bytes], { type });
}

export function sanitizeExportFilename(value: string) {
	const sanitized = value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-");
	return sanitized.replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}

function assertExportManifest(manifest: ProjectExportManifest): ProjectExportManifest {
	if (!manifest || manifest.version !== PROJECT_EXPORT_VERSION || manifest.app !== "arcumark") {
		throw new Error("Unsupported export format.");
	}
	if (!manifest.project?.timeline || !Array.isArray(manifest.project.media)) {
		throw new Error("Export file is missing project data.");
	}
	return manifest;
}
