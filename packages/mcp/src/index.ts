#!/usr/bin/env node
import { createMCPServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
	const { server, storage } = await createMCPServer();

	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Cleanup on exit
	process.on("SIGINT", async () => {
		await storage.close();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		await storage.close();
		process.exit(0);
	});
}

main().catch(console.error);
