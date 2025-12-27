import { program } from "commander";
import { createProjectCommand } from "./commands/project/create.js";
import { listProjectsCommand } from "./commands/project/list.js";
import { deleteProjectCommand } from "./commands/project/delete.js";

export const cli = program
	.name("arcumark")
	.description("Arcumark CLI - Video editing from the command line")
	.version("0.1.0");

// Project commands
const project = cli.command("project").description("Manage projects");

project
	.command("create")
	.description("Create a new project")
	.option("-n, --name <name>", "Project name")
	.option("-p, --preset <preset>", "Video preset ID")
	.action(createProjectCommand);

project
	.command("list")
	.alias("ls")
	.description("List all projects")
	.option("-j, --json", "Output as JSON")
	.action(listProjectsCommand);

project
	.command("delete <id>")
	.alias("rm")
	.description("Delete a project")
	.option("-f, --force", "Skip confirmation")
	.action(deleteProjectCommand);
