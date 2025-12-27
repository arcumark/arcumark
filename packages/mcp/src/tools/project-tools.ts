export const projectTools = [
	{
		name: "create_project",
		description: "Create a new Arcumark project",
		inputSchema: {
			type: "object",
			properties: {
				name: {
					type: "string",
					description: "Project name",
				},
				duration: {
					type: "number",
					description: "Initial duration in seconds",
					default: 60,
				},
			},
			required: ["name"],
		},
	},
	{
		name: "list_projects",
		description: "List all projects",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
	{
		name: "get_project",
		description: "Get project details",
		inputSchema: {
			type: "object",
			properties: {
				projectId: {
					type: "string",
					description: "Project ID",
				},
			},
			required: ["projectId"],
		},
	},
	{
		name: "delete_project",
		description: "Delete a project",
		inputSchema: {
			type: "object",
			properties: {
				projectId: {
					type: "string",
					description: "Project ID",
				},
			},
			required: ["projectId"],
		},
	},
	{
		name: "validate_timeline",
		description: "Validate a project's timeline structure",
		inputSchema: {
			type: "object",
			properties: {
				projectId: {
					type: "string",
					description: "Project ID",
				},
			},
			required: ["projectId"],
		},
	},
];

export function listTools() {
	return projectTools;
}
