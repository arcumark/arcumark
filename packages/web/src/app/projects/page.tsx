"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { CircleXIcon } from "lucide-react";

type StoredProject = {
	id: string;
	name: string;
};

const LOCAL_PREFIX = "arcumark:timeline:";

export default function ProjectsPage() {
	const router = useRouter();
	const [projects, setProjects] = useState<StoredProject[]>(() => {
		if (typeof window === "undefined") return [];
		const next: StoredProject[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !key.startsWith(LOCAL_PREFIX)) continue;
			try {
				const raw = localStorage.getItem(key);
				if (!raw) continue;
				const parsed = JSON.parse(raw) as { id?: string; name?: string } | null;
				const id = parsed?.id || key.replace(LOCAL_PREFIX, "");
				const name = parsed?.name || id;
				if (id) next.push({ id, name });
			} catch {
				const id = key.replace(LOCAL_PREFIX, "");
				if (id) next.push({ id, name: id });
			}
		}
		next.sort((a, b) => a.name.localeCompare(b.name));
		return next;
	});

	const handleOpen = (id: string) => {
		router.push(`/editor?id=${id}`);
	};

	const handleDelete = (id: string) => {
		if (typeof window === "undefined") return;
		try {
			localStorage.removeItem(`${LOCAL_PREFIX}${id}`);
		} catch {
			/* ignore */
		}
		setProjects((prev) => prev.filter((p) => p.id !== id));
	};

	return (
		<PageShell title="Projects" description="Saved projects from this browser.">
			{projects.length === 0 ? (
				<Empty className="border border-dashed">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleXIcon />
						</EmptyMedia>
						<EmptyTitle>No saved projects yet</EmptyTitle>
						<EmptyDescription>Create a new project to get started.</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button variant="default" size="sm" onClick={() => router.push("/")}>
							New Project
						</Button>
					</EmptyContent>
				</Empty>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>ID</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{projects.map((project) => (
							<TableRow key={project.id}>
								<TableCell className="font-medium">{project.name}</TableCell>
								<TableCell className="text-muted-foreground break-all">{project.id}</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<Button variant="default" size="sm" onClick={() => handleOpen(project.id)}>
											Open
										</Button>
										<Button variant="outline" size="sm" onClick={() => handleDelete(project.id)}>
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</PageShell>
	);
}
