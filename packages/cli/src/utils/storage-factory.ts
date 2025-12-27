import {
	FileStorage,
	SQLiteStorage,
	type StorageConfig,
	type TimelineStorage,
} from "@arcumark/shared";
import { loadConfig } from "./config.js";

export async function createStorage(): Promise<TimelineStorage> {
	const config = await loadConfig();
	const storageConfig: StorageConfig = {
		type: config.storage.type,
		basePath: config.storage.basePath,
		dbName: config.storage.dbName,
	};

	switch (storageConfig.type) {
		case "sqlite":
			return new SQLiteStorage(storageConfig);
		case "file":
		default:
			return new FileStorage(storageConfig);
	}
}
