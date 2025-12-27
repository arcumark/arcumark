import { createProjectId, VIDEO_PRESETS, type VideoPreset } from "@arcumark/shared";
import { createStorage } from "../../utils/storage-factory.js";
import { logger } from "../../utils/logger.js";

interface CreateOptions {
	name?: string;
	preset?: string;
}

export async function createProjectCommand(options: CreateOptions) {
	try {
		const storage = await createStorage();
		const id = createProjectId();
		const name = options.name || `Project ${new Date().toLocaleDateString()}`;
		const preset: VideoPreset =
			VIDEO_PRESETS.find((p) => p.id === options.preset) || VIDEO_PRESETS[0];

		const timeline = {
			id,
			name,
			duration: 60,
			tracks: [],
		};

		await storage.saveTimeline(timeline);
		await storage.close();

		logger.success(`Created project: ${name}`);
		logger.info(`Project ID: ${id}`);
		logger.info(`Preset: ${preset.name}`);
	} catch (error) {
		logger.error(`Failed to create project: ${error}`);
		process.exit(1);
	}
}
