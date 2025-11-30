"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";

type StoredProject = {
	id: string;
	name: string;
};

const LOCAL_PREFIX = "arcumark:timeline:";

export default function ProjectsPage() {
	const router = useRouter();
	const [projects, setProjects] = useState<StoredProject[]>([]);

	useEffect(() => {
		if (typeof window === "undefined") return;
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
		setProjects(next);
	}, []);

	const handleOpen = (id: string) => {
		router.push(`/editor/${id}`);
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
				<div className="text-sm text-neutral-400">No saved projects yet.</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2">
					{projects.map((project) => (
						<div
							key={project.id}
							className="flex flex-col gap-2 border border-neutral-800 bg-neutral-900 p-4"
						>
							<div className="truncate text-sm font-semibold text-neutral-100" title={project.name}>
								{project.name}
							</div>
							<div className="text-xs break-all text-neutral-400">{project.id}</div>
							<div className="flex gap-2">
								<button
									className="flex-1 cursor-pointer border border-blue-700 bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-600"
									onClick={() => handleOpen(project.id)}
								>
									Open
								</button>
								<button
									className="cursor-pointer border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700"
									onClick={() => handleDelete(project.id)}
								>
									Delete
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</PageShell>
	);
}
