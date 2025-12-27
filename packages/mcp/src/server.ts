import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { createStorage } from "./utils/storage-factory.js";
import { handleToolCall } from "./handlers/tools.js";
import { listTools } from "./tools/project-tools.js";

export async function createMCPServer() {
	const storage = await createStorage();

	const server = new Server(
		{
			name: "arcumark-mcp",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		}
	);

	// List available tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return { tools: listTools() };
	});

	// Execute tool
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		return await handleToolCall(request, storage);
	});

	return { server, storage };
}
