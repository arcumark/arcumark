import { createProjectId, validateTimeline } from "@arcumark/shared";
import { type TimelineStorage } from "@arcumark/shared/storage";

export async function handleToolCall(request: any, storage: TimelineStorage) {
	const { name, arguments: args } = request.params;

	switch (name) {
		case "create_project": {
			const id = createProjectId();
			const timeline = {
				id,
				name: args.name || "Untitled Project",
				duration: args.duration || 60,
				tracks: [],
			};
			await storage.saveTimeline(timeline);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ success: true, projectId: id, name: timeline.name }, null, 2),
					},
				],
			};
		}

		case "list_projects": {
			const projects = await storage.listTimelines();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(projects, null, 2),
					},
				],
			};
		}

		case "get_project": {
			const timeline = await storage.getTimeline(args.projectId);
			if (!timeline) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ error: "Project not found" }),
						},
					],
					isError: true,
				};
			}
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(timeline, null, 2),
					},
				],
			};
		}

		case "delete_project": {
			await storage.deleteTimeline(args.projectId);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ success: true, projectId: args.projectId }),
					},
				],
			};
		}

		case "validate_timeline": {
			const timeline = await storage.getTimeline(args.projectId);
			if (!timeline) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ error: "Project not found" }),
						},
					],
					isError: true,
				};
			}
			const result = validateTimeline(timeline);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		}

		default:
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ error: "Unknown tool" }),
					},
				],
				isError: true,
			};
	}
}
