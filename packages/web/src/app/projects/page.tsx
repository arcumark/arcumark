"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { readAllMediaRecords } from "@/lib/client/media-store";
import { validateTimeline, type Timeline } from "@arcumark/shared";
import { buildProjectExportPackage, sanitizeExportFilename } from "@/lib/project/transfer";

type StoredProject = {
	id: string;
	name: string;
};

const LOCAL_PREFIX = "arcumark:timeline:";

export default function ProjectsPage() {
	const router = useRouter();
	const [exportingId, setExportingId] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportMessage, setExportMessage] = useState<string | null>(null);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [downloadName, setDownloadName] = useState<string | null>(null);
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

	useEffect(() => {
		return () => {
			if (downloadUrl) URL.revokeObjectURL(downloadUrl);
		};
	}, [downloadUrl]);

	const handleExport = async (id: string) => {
		if (typeof window === "undefined") return;
		setExportError(null);
		setExportMessage(null);
		setExportingId(id);
		setDownloadName(null);
		setDownloadUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});

		try {
			const key = `${LOCAL_PREFIX}${id}`;
			const raw = localStorage.getItem(key);
			if (!raw) {
				throw new Error("Timeline not found for this project.");
			}
			const parsed = JSON.parse(raw) as Timeline;
			const validation = validateTimeline(parsed);
			if (!validation.ok) {
				throw new Error(`Timeline invalid: ${validation.errors.join(", ")}`);
			}

			const timeline = validation.timeline;
			const mediaIds = new Set<string>();
			for (const track of timeline.tracks) {
				for (const clip of track.clips) {
					if (clip.sourceId && clip.sourceId !== "text" && clip.sourceId !== "shape") {
						mediaIds.add(clip.sourceId);
					}
				}
			}

			const allMedia = await readAllMediaRecords();
			const selectedMedia = allMedia.filter((record) => mediaIds.has(record.id));
			const missingMedia = Array.from(mediaIds).filter(
				(id) => !selectedMedia.some((record) => record.id === id)
			);

			const { blob } = await buildProjectExportPackage(timeline, selectedMedia);
			const filenameBase = sanitizeExportFilename(timeline.name || id);
			const fileName = `arcumark-${filenameBase}-${id}.arcumark`;
			const url = URL.createObjectURL(blob);
			setDownloadUrl(url);
			setDownloadName(fileName);

			const missingNote =
				missingMedia.length > 0
					? ` Missing media: ${missingMedia.length} item(s) were not found.`
					: "";
			setExportMessage(
				`Export ready. ${selectedMedia.length} media item(s) included.${missingNote}`
			);
		} catch (error) {
			setExportError(error instanceof Error ? error.message : "Export failed.");
		} finally {
			setExportingId(null);
		}
	};

	const handleDownload = () => {
		if (!downloadUrl || !downloadName) return;
		const link = document.createElement("a");
		link.href = downloadUrl;
		link.download = downloadName;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(downloadUrl);
		setDownloadUrl(null);
		setDownloadName(null);
		setExportMessage("Download started.");
	};

	return (
		<PageShell title="Projects" description="Saved projects from this browser.">
			{projects.length > 0 && (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="default" size="sm" onClick={() => router.push("/")}>
							New Project
						</Button>
						<Button variant="outline" size="sm" onClick={() => router.push("/import")}>
							Import
						</Button>
					</div>
					{exportingId && <div className="text-muted-foreground text-xs">Exporting...</div>}
				</div>
			)}
			{exportError && (
				<Alert variant="destructive">
					<AlertTitle>Export failed</AlertTitle>
					<AlertDescription>{exportError}</AlertDescription>
				</Alert>
			)}
			{exportMessage && (
				<Alert>
					<AlertTitle>{downloadUrl ? "Export ready" : "Export status"}</AlertTitle>
					<AlertDescription>{exportMessage}</AlertDescription>
					{downloadUrl && (
						<AlertAction>
							<Button variant="default" size="sm" onClick={handleDownload}>
								Download
							</Button>
						</AlertAction>
					)}
				</Alert>
			)}
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
						<div className="flex flex-wrap justify-center gap-2">
							<Button variant="default" size="sm" onClick={() => router.push("/")}>
								New Project
							</Button>
							<Button variant="outline" size="sm" onClick={() => router.push("/import")}>
								Import
							</Button>
						</div>
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
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleExport(project.id)}
											disabled={exportingId === project.id}
										>
											Export
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
