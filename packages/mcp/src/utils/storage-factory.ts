import { FileStorage, type TimelineStorage } from "@arcumark/shared/storage";
import { homedir } from "os";
import path from "path";

export async function createStorage(): Promise<TimelineStorage> {
	// MCP uses file-based storage by default
	return new FileStorage({
		type: "file",
		basePath: path.join(homedir(), ".arcumark", "projects"),
	});
}
