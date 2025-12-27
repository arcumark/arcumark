import { createStorage } from "../../utils/storage-factory.js";
import { logger } from "../../utils/logger.js";

interface ListOptions {
	json?: boolean;
}

export async function listProjectsCommand(options: ListOptions) {
	try {
		const storage = await createStorage();
		const projects = await storage.listTimelines();
		await storage.close();

		if (options.json) {
			console.log(JSON.stringify(projects, null, 2));
			return;
		}

		if (projects.length === 0) {
			logger.info("No projects found");
			return;
		}

		console.log(`\nFound ${projects.length} project(s):\n`);
		projects.forEach((project) => {
			console.log(`  ${project.name}`);
			console.log(`  ID: ${project.id}\n`);
		});
	} catch (error) {
		logger.error(`Failed to list projects: ${error}`);
		process.exit(1);
	}
}
