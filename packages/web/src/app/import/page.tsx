"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldDescription } from "@/components/ui/field";
import { readAllMediaRecords, saveMediaRecord } from "@/lib/client/media-store";
import { createProjectId, projectExistsInLocalStorage } from "@/lib/utils";
import { validateTimeline, type Timeline } from "@arcumark/shared";
import { readProjectExportFile, type ProjectImportPayload } from "@/lib/project/transfer";

const DEFAULT_PROJECT_NAME = "Project";

function remapTimelineSources(timeline: Timeline, map: Map<string, string>): Timeline {
	if (map.size === 0) return timeline;
	return {
		...timeline,
		tracks: timeline.tracks.map((track) => ({
			...track,
			clips: track.clips.map((clip) => {
				const nextId = map.get(clip.sourceId);
				return nextId ? { ...clip, sourceId: nextId } : clip;
			}),
		})),
	};
}

export default function ImportPage() {
	const router = useRouter();
	const [payload, setPayload] = useState<ProjectImportPayload | null>(null);
	const [timeline, setTimeline] = useState<Timeline | null>(null);
	const [projectId, setProjectId] = useState("");
	const [projectName, setProjectName] = useState("");
	const [replaceExisting, setReplaceExisting] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [importMessage, setImportMessage] = useState<string | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [importedId, setImportedId] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);

	const summary = useMemo(() => {
		if (!payload) return null;
		const totalClips = payload.timeline.tracks.reduce(
			(total, track) => total + track.clips.length,
			0
		);
		return {
			mediaCount: payload.media.length,
			trackCount: payload.timeline.tracks.length,
			clipCount: totalClips,
			duration: payload.timeline.duration,
		};
	}, [payload]);

	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		setImportError(null);
		setImportMessage(null);
		setImportedId(null);
		setFileName(file.name);

		try {
			const parsed = await readProjectExportFile(file);
			const validation = validateTimeline(parsed.timeline);
			if (!validation.ok) {
				throw new Error(`Timeline invalid: ${validation.errors.join(", ")}`);
			}
			setPayload(parsed);
			setTimeline(validation.timeline);
			setProjectId(validation.timeline.id);
			setProjectName(validation.timeline.name || DEFAULT_PROJECT_NAME);
		} catch (error) {
			setPayload(null);
			setTimeline(null);
			setProjectId("");
			setProjectName("");
			setImportError(error instanceof Error ? error.message : "Failed to read export file.");
		}
	};

	const handleImport = async () => {
		if (!payload || !timeline) {
			setImportError("Select a project export file first.");
			return;
		}

		setImportError(null);
		setImportMessage(null);
		setIsImporting(true);
		setImportedId(null);

		try {
			const trimmedId = projectId.trim() || timeline.id;
			const trimmedName = projectName.trim() || timeline.name || DEFAULT_PROJECT_NAME;
			let targetId = trimmedId;
			const existingProject = projectExistsInLocalStorage(targetId);
			if (existingProject && !replaceExisting) {
				targetId = createProjectId();
			}

			const existingMedia = await readAllMediaRecords();
			const existingMediaIds = new Set(existingMedia.map((record) => record.id));
			const mediaIdMap = new Map<string, string>();
			const now = Date.now();

			for (const [index, record] of payload.media.entries()) {
				let nextId = record.id;
				if (!replaceExisting && existingMediaIds.has(nextId)) {
					nextId = `media_${now}_${index}`;
					mediaIdMap.set(record.id, nextId);
				}
				existingMediaIds.add(nextId);
				await saveMediaRecord({
					id: nextId,
					name: record.name,
					type: record.type,
					durationSeconds: record.durationSeconds,
					blob: record.blob,
				});
			}

			let nextTimeline: Timeline = {
				...timeline,
				id: targetId,
				name: trimmedName,
			};
			nextTimeline = remapTimelineSources(nextTimeline, mediaIdMap);

			localStorage.setItem(`arcumark:timeline:${nextTimeline.id}`, JSON.stringify(nextTimeline));
			setProjectId(nextTimeline.id);
			setProjectName(nextTimeline.name);
			setImportedId(nextTimeline.id);

			const notes: string[] = ["Import complete."];
			if (existingProject && !replaceExisting) {
				notes.push(`Existing project detected; imported as ${nextTimeline.id}.`);
			}
			if (mediaIdMap.size > 0) {
				notes.push(`Remapped ${mediaIdMap.size} media item(s) to avoid collisions.`);
			}
			if (payload.source === "json") {
				notes.push("Legacy export detected; converted to the new format.");
			}
			setImportMessage(notes.join(" "));
		} catch (error) {
			setImportError(error instanceof Error ? error.message : "Import failed.");
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<PageShell title="Import" description="Restore a project export in this browser.">
			<div className="grid gap-2">
				<Label htmlFor="project-file">Project export file</Label>
				<Input
					id="project-file"
					type="file"
					accept=".arcumark,.arcumark.json,application/json"
					onChange={handleFileChange}
				/>
				<FieldDescription>
					Choose an export from the Projects list to restore the timeline and media.
				</FieldDescription>
				{fileName && <div className="text-muted-foreground text-xs">Selected: {fileName}</div>}
			</div>

			{payload && summary && (
				<div className="grid gap-3 rounded-none border border-dashed p-3 text-xs">
					<div className="font-medium">Project summary</div>
					<div className="text-muted-foreground">
						Tracks: {summary.trackCount} | Clips: {summary.clipCount} | Media: {summary.mediaCount}{" "}
						| Duration: {summary.duration}s
					</div>
					{payload.source === "json" && (
						<div className="text-muted-foreground">Imported from legacy JSON export.</div>
					)}
				</div>
			)}

			{payload && (
				<div className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="project-name">Project name</Label>
						<Input
							id="project-name"
							value={projectName}
							onChange={(event) => setProjectName(event.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="project-id">Project ID</Label>
						<Input
							id="project-id"
							value={projectId}
							onChange={(event) => setProjectId(event.target.value)}
						/>
						<FieldDescription>Used for the editor URL.</FieldDescription>
					</div>
					<div className="flex items-center gap-2 text-xs">
						<Checkbox
							id="replace-existing"
							checked={replaceExisting}
							onCheckedChange={(checked) => setReplaceExisting(Boolean(checked))}
						/>
						<Label htmlFor="replace-existing" className="text-xs">
							Replace existing project if the ID already exists
						</Label>
					</div>
				</div>
			)}

			{importError && (
				<Alert variant="destructive">
					<AlertTitle>Import failed</AlertTitle>
					<AlertDescription>{importError}</AlertDescription>
				</Alert>
			)}

			{importMessage && (
				<Alert>
					<AlertTitle>Import ready</AlertTitle>
					<AlertDescription>{importMessage}</AlertDescription>
				</Alert>
			)}

			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button variant="outline" size="sm" onClick={() => router.push("/projects")}>
					Back to Projects
				</Button>
				<div className="flex flex-wrap gap-2">
					{importedId && (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => router.push(`/editor?id=${importedId}`)}
						>
							Open Project
						</Button>
					)}
					<Button
						variant="default"
						size="sm"
						onClick={handleImport}
						disabled={!payload || isImporting}
					>
						{isImporting ? "Importing..." : "Import"}
					</Button>
				</div>
			</div>
		</PageShell>
	);
}
