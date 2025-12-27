import { promises as fs } from "fs";
import path from "path";
import { homedir } from "os";

export interface CliConfig {
	version: string;
	storage: {
		type: "file" | "sqlite";
		basePath?: string;
		dbName?: string;
	};
	server: {
		port: number;
		host: string;
	};
	defaults: {
		preset: string;
	};
}

const DEFAULT_CONFIG: CliConfig = {
	version: "1.0",
	storage: {
		type: "file",
		basePath: path.join(homedir(), ".arcumark", "projects"),
	},
	server: {
		port: 3000,
		host: "localhost",
	},
	defaults: {
		preset: "1080p_h30",
	},
};

export async function getConfigPath(): Promise<string> {
	const configDir = path.join(homedir(), ".arcumark");
	await fs.mkdir(configDir, { recursive: true });
	return path.join(configDir, "config.json");
}

export async function loadConfig(): Promise<CliConfig> {
	const configPath = await getConfigPath();
	try {
		const content = await fs.readFile(configPath, "utf-8");
		return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
	} catch {
		return DEFAULT_CONFIG;
	}
}

export async function saveConfig(config: CliConfig): Promise<void> {
	const configPath = await getConfigPath();
	await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}
