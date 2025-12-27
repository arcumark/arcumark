import prompts from "prompts";
import { createStorage } from "../../utils/storage-factory.js";
import { logger } from "../../utils/logger.js";

interface DeleteOptions {
	force?: boolean;
}

export async function deleteProjectCommand(projectId: string, options: DeleteOptions) {
	try {
		const storage = await createStorage();

		// Check if project exists
		const exists = await storage.timelineExists(projectId);
		if (!exists) {
			logger.error(`Project not found: ${projectId}`);
			process.exit(1);
		}

		// Confirm deletion unless --force
		if (!options.force) {
			const response = await prompts({
				type: "confirm",
				name: "confirm",
				message: `Are you sure you want to delete project ${projectId}?`,
				initial: false,
			});

			if (!response.confirm) {
				logger.info("Deletion cancelled");
				return;
			}
		}

		await storage.deleteTimeline(projectId);
		await storage.close();

		logger.success(`Deleted project: ${projectId}`);
	} catch (error) {
		logger.error(`Failed to delete project: ${error}`);
		process.exit(1);
	}
}
