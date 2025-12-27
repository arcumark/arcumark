"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	readAllMediaRecords,
	saveMediaRecord,
	updateMediaDuration,
} from "@/lib/client/media-store";
import { VIDEO_PRESETS } from "@arcumark/shared";
import { Clip, Timeline, Track, validateTimeline } from "@arcumark/shared";
import { isValidProjectId, projectExistsInLocalStorage } from "@/lib/utils";
import { TopBar } from "./_components/top-bar";
import { MediaBrowser, MediaItem, MEDIA_DRAG_TYPE } from "./_components/media-browser";
import { Viewer } from "./_components/viewer";
import { Inspector } from "./_components/Inspector";
import { TimelineView } from "./_components/timeline-view";
import { VideoIcon, ImageIcon, MusicIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// This page is fully client-side and requires no server-side processing
export const dynamic = "force-static";
export const dynamicParams = true;

const MIN_LEFT = 300;
const MIN_RIGHT = 300;
const MIN_TOP = 400;
const MIN_TIMELINE = 200;

function nextTrackId(kind: Track["kind"], tracks: Track[]) {
	const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : "T";
	const count = tracks.filter((t) => t.kind === kind).length + 1;
	return `${prefix}${count}`;
}

function mediaIcon(kind: MediaItem["type"]) {
	if (kind === "audio") return <MusicIcon className="h-4 w-4" aria-hidden />;
	if (kind === "image") return <ImageIcon className="h-4 w-4" aria-hidden />;
	return <VideoIcon className="h-4 w-4" aria-hidden />;
}

function LoadingScreen() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-950">
			<div className="flex items-center gap-3">
				<div className="border-primary h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
				<span>Loading workspace…</span>
			</div>
		</div>
	);
}

function formatTimecode(time: number) {
	const clamped = Math.max(0, time);
	const hours = Math.floor(clamped / 3600)
		.toString()
		.padStart(2, "0");
	const minutes = Math.floor((clamped % 3600) / 60)
		.toString()
		.padStart(2, "0");
	const seconds = Math.floor(clamped % 60)
		.toString()
		.padStart(2, "0");
	const frames = Math.floor((clamped % 1) * 30)
		.toString()
		.padStart(2, "0");
	return `${hours}:${minutes}:${seconds}:${frames}`;
}

function formatDurationLabel(seconds: number) {
	const total = Math.max(0, Math.floor(seconds));
	const mins = Math.floor(total / 60)
		.toString()
		.padStart(2, "0");
	const secs = Math.floor(total % 60)
		.toString()
		.padStart(2, "0");
	return `${mins}:${secs}`;
}

function createDefaultTimeline(projectId: string): Timeline {
	return {
		id: projectId,
		name: "Project",
		duration: 60,
		tracks: [],
	};
}

function EditorPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const projectId = searchParams?.get("id");
	const presetParam = searchParams?.get("preset");

	const [timeline, setTimeline] = useState<Timeline>(() => createDefaultTimeline(projectId || ""));
	const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [loop, setLoop] = useState(false);
	const [zoom, setZoom] = useState(1.2);
	const [activePresetId, setActivePresetId] = useState<string | null>(presetParam);
	const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
	const [leftWidth, setLeftWidth] = useState(MIN_LEFT + 60);
	const [rightWidth, setRightWidth] = useState(MIN_RIGHT + 60);
	const [topHeight, setTopHeight] = useState(MIN_TOP + 140);
	const [isLoading, setIsLoading] = useState(true);
	const [snapEnabled, setSnapEnabled] = useState(true);
	const [editMode, setEditMode] = useState<"select" | "transform" | "crop" | "distort">("select");
	const [isPortrait, setIsPortrait] = useState(false);
	const [isValidProject, setIsValidProject] = useState(false);
	const clipboardRef = useRef<{ clip: Clip; kind: Track["kind"] } | null>(null);
	const dragState = useRef<{
		type: "left" | "right" | "vertical";
		startX: number;
		startY: number;
		startLeft: number;
		startRight: number;
		startTop: number;
	} | null>(null);

	useEffect(() => {
		setActivePresetId((prev) => prev ?? presetParam ?? VIDEO_PRESETS[0]?.id ?? null);
	}, [presetParam]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const updateOrientation = () => {
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			setIsPortrait(vh > vw);
			setLeftWidth((prev) => Math.max(MIN_LEFT, Math.min(prev, Math.floor(vw * 0.4))));
			setRightWidth((prev) => Math.max(MIN_RIGHT, Math.min(prev, Math.floor(vw * 0.4))));
			setTopHeight(Math.max(MIN_TOP, Math.floor(vh * 0.5)));
		};
		updateOrientation();
		window.addEventListener("resize", updateOrientation);
		setIsLoading(false);
		return () => window.removeEventListener("resize", updateOrientation);
	}, []);

	useEffect(() => {
		if (!projectId) return;

		// Check if this is a valid, existing project
		const exists = projectExistsInLocalStorage(projectId);
		setIsValidProject(exists);

		if (!exists) return;

		const key = `arcumark:timeline:${projectId}`;
		try {
			const stored = localStorage.getItem(key);
			if (stored) {
				const parsed = JSON.parse(stored) as Timeline;
				const validation = validateTimeline(parsed);
				if (validation.ok && validation.timeline.id === projectId) {
					setTimeline(validation.timeline);
					setSelectedClipId(null);
					setCurrentTime(0);
					setIsPlaying(false);
				}
			}
		} catch (e) {
			console.error("Failed to load timeline", e);
		}
	}, [projectId]);

	useEffect(() => {
		// Only save if this is a valid, existing project
		if (!isValidProject || !projectId) return;

		const key = `arcumark:timeline:${projectId}`;
		try {
			localStorage.setItem(key, JSON.stringify(timeline));
		} catch (e) {
			console.error("Failed to persist timeline", e);
		}
	}, [timeline, projectId, isValidProject]);

	useEffect(() => {
		if (!isPlaying) return;
		let frame = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const delta = (now - last) / 1000;
			last = now;
			setCurrentTime((prev) => {
				let next = prev + delta;
				if (next >= timeline.duration) {
					if (loop) {
						next = 0;
					} else {
						next = timeline.duration;
						setIsPlaying(false);
					}
				}
				return next;
			});
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [isPlaying, timeline.duration, loop]);

	useEffect(() => {
		setCurrentTime((prev) => Math.min(prev, timeline.duration));
	}, [timeline.duration]);

	const selectedClip = useMemo<Clip | null>(() => {
		if (!selectedClipId) return null;
		for (const track of timeline.tracks) {
			const clip = track.clips.find((c) => c.id === selectedClipId);
			if (clip) return clip;
		}
		return null;
	}, [timeline.tracks, selectedClipId]);

	const selectedClipKind = useMemo<Track["kind"] | null>(() => {
		if (!selectedClipId) return null;
		for (const track of timeline.tracks) {
			const clip = track.clips.find((c) => c.id === selectedClipId);
			if (clip) return track.kind;
		}
		return null;
	}, [selectedClipId, timeline.tracks]);

	const handleClipChange = (clipId: string, changes: Partial<Clip>) => {
		setTimeline((prev) => {
			const nextTracks = prev.tracks.map((track) => {
				const clipIndex = track.clips.findIndex((c) => c.id === clipId);
				if (clipIndex === -1) return track;
				const existing = track.clips[clipIndex];
				const updated: Clip = { ...existing, ...changes };
				updated.start = Math.max(0, updated.start);
				updated.end = Math.max(updated.end, updated.start + 0.05);
				if (updated.end > prev.duration) {
					updated.end = prev.duration;
					if (updated.start >= updated.end) {
						updated.start = Math.max(0, updated.end - 0.05);
					}
				}
				return { ...track, clips: track.clips.map((c, idx) => (idx === clipIndex ? updated : c)) };
			});
			return { ...prev, tracks: nextTracks };
		});
	};

	const activeVideoClip = useMemo(() => {
		const videoTrack = timeline.tracks.find((t) => t.kind === "video");
		if (!videoTrack) return null;
		return (
			videoTrack.clips.find((clip) => currentTime >= clip.start && currentTime <= clip.end) ?? null
		);
	}, [timeline.tracks, currentTime]);

	const activeVideoSource = useMemo(() => {
		if (!activeVideoClip) return null;
		return mediaItems.find((m) => m.id === activeVideoClip.sourceId && m.type === "video") ?? null;
	}, [mediaItems, activeVideoClip]);

	const activeAudioClip = useMemo(() => {
		const audioTrack = timeline.tracks.find((t) => t.kind === "audio");
		if (!audioTrack) return null;
		return (
			audioTrack.clips.find((clip) => currentTime >= clip.start && currentTime <= clip.end) ?? null
		);
	}, [timeline.tracks, currentTime]);

	const activeAudioSource = useMemo(() => {
		if (!activeAudioClip) return null;
		return mediaItems.find((m) => m.id === activeAudioClip.sourceId && m.type === "audio") ?? null;
	}, [mediaItems, activeAudioClip]);

	const activeTextClip = useMemo(() => {
		const textTrack = timeline.tracks.find((t) => t.kind === "text");
		if (!textTrack) return null;
		return (
			textTrack.clips.find((clip) => currentTime >= clip.start && currentTime <= clip.end) ?? null
		);
	}, [timeline.tracks, currentTime]);

	useEffect(() => {
		const handleMove = (e: MouseEvent) => {
			if (!dragState.current) return;
			if (dragState.current.type === "left") {
				const delta = e.clientX - dragState.current.startX;
				const next = Math.max(MIN_LEFT, dragState.current.startLeft + delta);
				const maxLeft = Math.max(140, window.innerWidth - rightWidth - 320);
				setLeftWidth(Math.min(next, maxLeft));
			} else if (dragState.current.type === "right") {
				const delta = e.clientX - dragState.current.startX;
				const next = Math.max(MIN_RIGHT, dragState.current.startRight - delta);
				const maxRight = Math.max(140, window.innerWidth - leftWidth - 320);
				setRightWidth(Math.min(next, maxRight));
			} else if (dragState.current.type === "vertical") {
				const delta = e.clientY - dragState.current.startY;
				// UI chrome: TopBar(48px) + container padding(16px) + gaps(16px) + divider(4px) = 84px
				const chromeHeight = 84;
				const availableHeight = window.innerHeight - chromeHeight;

				// Dynamic minimum heights based on available screen space
				// Ensure timeline gets at least 30% and top section gets at least 50% of available height
				const dynamicMinTimeline = Math.min(MIN_TIMELINE, availableHeight * 0.3);
				const dynamicMinTop = Math.min(MIN_TOP, availableHeight * 0.5);

				const next = Math.max(dynamicMinTop, dragState.current.startTop + delta);
				const maxTop = Math.max(dynamicMinTop, availableHeight - dynamicMinTimeline);
				setTopHeight(Math.min(next, maxTop));
			}
		};
		const handleUp = () => {
			dragState.current = null;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [leftWidth, rightWidth]);

	useEffect(() => {
		let cancelled = false;
		const objectUrls: string[] = [];
		(async () => {
			try {
				const records = await readAllMediaRecords();
				if (cancelled) return;
				const mapped: MediaItem[] = records.map((rec) => {
					const url = URL.createObjectURL(rec.blob);
					objectUrls.push(url);
					const kind = rec.icon ?? rec.type;
					return {
						id: rec.id,
						name: rec.name,
						durationSeconds: rec.durationSeconds,
						durationLabel: formatDurationLabel(rec.durationSeconds),
						type: rec.type,
						icon: mediaIcon(kind),
						url,
					};
				});
				setMediaItems(mapped);
			} catch (e) {
				console.error("Failed to load media library", e);
			}
		})();
		return () => {
			cancelled = true;
			objectUrls.forEach((url) => URL.revokeObjectURL(url));
		};
	}, []);

	const handleImportMedia = (
		files: FileList,
		options?: { autoAdd?: boolean; startTime?: number }
	) => {
		// eslint-disable-next-line react-hooks/purity -- Date.now() is safe in event handlers
		const createdAt = Date.now();
		const nextItems: MediaItem[] = Array.from(files).map((file, index) => {
			const url = URL.createObjectURL(file);
			const type: MediaItem["type"] = file.type.startsWith("audio")
				? "audio"
				: file.type.startsWith("image")
					? "image"
					: "video";
			const id = `media_${createdAt}_${index}`;
			const baseDuration = 5;
			const item: MediaItem = {
				id,
				name: file.name,
				durationLabel: formatDurationLabel(baseDuration),
				durationSeconds: baseDuration,
				type,
				icon: mediaIcon(type),
				url,
			};
			saveMediaRecord({
				id,
				name: item.name,
				type: item.type,
				icon: item.type,
				durationSeconds: baseDuration,
				blob: file,
			}).catch((e) => console.error("Failed to persist media", e));
			if (type === "video" || type === "audio") {
				const probe = document.createElement(type === "video" ? "video" : "audio");
				probe.preload = "metadata";
				probe.src = url;
				probe.onloadedmetadata = () => {
					const duration =
						probe.duration && Number.isFinite(probe.duration) ? probe.duration : baseDuration;
					setMediaItems((prev) =>
						prev.map((m) =>
							m.id === id
								? { ...m, durationSeconds: duration, durationLabel: formatDurationLabel(duration) }
								: m
						)
					);
					updateMediaDuration(id, duration).catch((e) =>
						console.error("Failed to update media duration", e)
					);
				};
			}
			return item;
		});
		setMediaItems((prev) => [...nextItems, ...prev]);

		if (options?.autoAdd) {
			let cursor = options.startTime ?? 0;
			nextItems.forEach((item) => {
				handleAddClipFromMedia(item, cursor);
				cursor += item.durationSeconds + 0.25;
			});
		}
	};

	const handleAddClipFromMedia = (item: MediaItem, startOverride?: number) => {
		let newClipStart = 0;
		let newClipId = "";
		const targetKind = item.type === "audio" ? "audio" : "video";
		setTimeline((prev) => {
			let nextTracks = [...prev.tracks];
			let trackIndex = nextTracks.findIndex((t) => t.kind === targetKind && t.clips.length === 0);
			if (trackIndex === -1) {
				const newTrackId = nextTrackId(targetKind, nextTracks);
				nextTracks = [...nextTracks, { id: newTrackId, kind: targetKind, clips: [] }];
				trackIndex = nextTracks.length - 1;
			}
			const track = nextTracks[trackIndex];
			const lastEnd = track.clips.reduce((max, clip) => Math.max(max, clip.end), 0);
			const start =
				startOverride !== undefined
					? Math.max(0, startOverride)
					: lastEnd === 0
						? 0
						: lastEnd + 0.25;
			const duration = Math.max(0.5, item.durationSeconds || 5);
			let end = start + duration;
			newClipStart = start;
			let nextDuration = prev.duration;
			if (end > prev.duration) {
				nextDuration = Math.ceil(end + 1);
			}
			if (end > nextDuration) {
				end = nextDuration;
			}
			const clipId = `clip_${item.id}_${Math.floor(Date.now() / 1000)}`;
			newClipId = clipId;
			const updatedTrack: typeof track = {
				...track,
				clips: [
					...track.clips,
					{
						id: clipId,
						start,
						end,
						sourceId: item.id,
						props: { name: item.name },
					},
				],
			};
			nextTracks[trackIndex] = updatedTrack;
			return { ...prev, duration: nextDuration, tracks: nextTracks };
		});
		if (newClipId) {
			setSelectedClipId(newClipId);
		}
		if (!Number.isNaN(newClipStart)) {
			setCurrentTime(newClipStart);
		}
	};

	const handlePasteClip = useCallback(() => {
		const data = clipboardRef.current;
		if (!data) return;
		const duration = Math.max(0.05, data.clip.end - data.clip.start);
		let createdId: string | null = null;
		let createdStart = currentTime;
		setTimeline((prev) => {
			let nextTracks = [...prev.tracks];
			let trackIndex = nextTracks.findIndex((t) => t.kind === data.kind && t.clips.length === 0);
			if (trackIndex === -1) {
				const newTrackId = nextTrackId(data.kind, nextTracks);
				nextTracks = [...nextTracks, { id: newTrackId, kind: data.kind, clips: [] }];
				trackIndex = nextTracks.length - 1;
			}
			const track = nextTracks[trackIndex];
			const start = Math.max(0, currentTime);
			let end = start + duration;
			let nextDuration = prev.duration;
			if (end > prev.duration) {
				nextDuration = Math.ceil(end + 1);
			}
			if (end > nextDuration) {
				end = nextDuration;
			}
			const newClip: Clip = {
				...data.clip,
				id: `${data.clip.id}_copy_${Date.now()}`,
				start,
				end,
				props: data.clip.props ? { ...data.clip.props } : undefined,
			};
			createdId = newClip.id;
			createdStart = start;
			nextTracks[trackIndex] = { ...track, clips: [...track.clips, newClip] };
			return { ...prev, duration: nextDuration, tracks: nextTracks };
		});
		if (createdId) {
			setSelectedClipId(createdId);
			setCurrentTime(createdStart);
		}
	}, [currentTime]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handleKey = (e: KeyboardEvent) => {
			// Play/pause with Space
			if (e.code === "Space") {
				const target = e.target as HTMLElement | null;
				if (target) {
					const tag = target.tagName.toLowerCase();
					if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable)
						return;
				}
				e.preventDefault();
				setIsPlaying((prev) => !prev);
			}
			// Copy selected clip
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
				if (selectedClip && selectedClipKind) {
					clipboardRef.current = {
						clip: {
							...selectedClip,
							props: selectedClip.props ? { ...selectedClip.props } : undefined,
						},
						kind: selectedClipKind,
					};
				}
			}
			// Paste clip
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v") {
				const target = e.target as HTMLElement | null;
				if (target) {
					const tag = target.tagName.toLowerCase();
					if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable)
						return;
				}
				e.preventDefault();
				handlePasteClip();
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [handlePasteClip, selectedClip, selectedClipKind]);

	if (isLoading) {
		return <LoadingScreen />;
	}

	// Show error if project ID is missing, invalid, or doesn't exist
	if (!projectId) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-neutral-950">
				<div className="flex flex-col items-center gap-4 text-center">
					<h1 className="text-2xl font-bold">Project ID Required</h1>
					<p className="text-muted-foreground">
						Please provide a project ID in the URL (e.g., /editor?id=your-project-id)
					</p>
					<Button onClick={() => router.push("/")}>Go to Home</Button>
				</div>
			</div>
		);
	}

	if (!isValidProjectId(projectId)) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-neutral-950">
				<div className="flex flex-col items-center gap-4 text-center">
					<h1 className="text-2xl font-bold">Invalid Project ID</h1>
					<p className="text-muted-foreground">
						The project ID &ldquo;{projectId}&rdquo; is not a valid format.
					</p>
					<p className="text-muted-foreground text-xs">
						Project IDs must be in UUID v4 format or start with &ldquo;proj_&rdquo;
					</p>
					<Button onClick={() => router.push("/")}>Go to Home</Button>
				</div>
			</div>
		);
	}

	if (!isLoading && !isValidProject) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-neutral-950">
				<div className="flex flex-col items-center gap-4 text-center">
					<h1 className="text-2xl font-bold">Project Not Found</h1>
					<p className="text-muted-foreground">No project found with ID: {projectId}</p>
					<p className="text-muted-foreground text-xs">
						The project may have been deleted or never existed in this browser.
					</p>
					<div className="flex gap-2">
						<Button onClick={() => router.push("/")}>Go to Home</Button>
						<Button variant="outline" onClick={() => router.push("/projects")}>
							View All Projects
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col bg-neutral-950">
			<TopBar
				projectName={timeline.name}
				isPlaying={isPlaying}
				loop={loop}
				timecode={formatTimecode(currentTime)}
				onExport={() => router.push(`/export?id=${projectId}`)}
				onPlayToggle={() => setIsPlaying((p) => !p)}
				onStop={() => {
					setIsPlaying(false);
					setCurrentTime(0);
				}}
				onStep={(delta) => {
					setCurrentTime((prev) => Math.min(Math.max(prev + delta, 0), timeline.duration));
				}}
				onLoopToggle={() => setLoop((p) => !p)}
			/>
			<div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
				<div
					className={`flex min-h-[320px] gap-2 ${isPortrait ? "flex-col" : ""}`}
					style={{ height: isPortrait ? undefined : topHeight }}
				>
					<div
						className="flex flex-col border border-neutral-800 bg-neutral-900"
						style={isPortrait ? undefined : { width: leftWidth, minWidth: MIN_LEFT }}
					>
						<div className="flex h-8 items-center border-b border-neutral-800 bg-neutral-900 px-3 text-xs font-semibold select-none">
							Library
						</div>
						<div className="flex flex-1 overflow-hidden">
							<MediaBrowser items={mediaItems} onImport={handleImportMedia} />
						</div>
					</div>
					{!isPortrait && (
						<div
							className="hover:bg-primary w-1 cursor-col-resize bg-neutral-800/70 transition"
							onMouseDown={(e) => {
								e.preventDefault();
								dragState.current = {
									type: "left",
									startX: e.clientX,
									startY: e.clientY,
									startLeft: leftWidth,
									startRight: rightWidth,
									startTop: topHeight,
								};
							}}
						/>
					)}
					<div
						className="flex flex-1 flex-col border border-neutral-800 bg-neutral-900"
						style={isPortrait ? { minHeight: 300 } : undefined}
					>
						<div className="flex h-8 items-center border-b border-neutral-800 bg-neutral-900 px-3 text-xs font-semibold select-none">
							Viewer
						</div>
						<div className="flex flex-1 overflow-hidden">
							<Viewer
								currentTime={currentTime}
								duration={timeline.duration}
								isPlaying={isPlaying}
								zoom={zoom}
								presetOptions={VIDEO_PRESETS}
								activePresetId={activePresetId}
								activeClip={activeVideoClip}
								activeSource={activeVideoSource}
								activeAudioClip={activeAudioClip}
								activeAudioSource={activeAudioSource}
								activeTextClip={activeTextClip}
								selectedClipId={selectedClipId}
								selectedClipKind={selectedClipKind}
								editMode={editMode}
								onAdjustClip={(clipId, props) => {
									setTimeline((prev) => {
										const nextTracks = prev.tracks.map((track) => ({
											...track,
											clips: track.clips.map((clip) =>
												clip.id === clipId ? { ...clip, props: { ...clip.props, ...props } } : clip
											),
										}));
										return { ...prev, tracks: nextTracks };
									});
								}}
								onScrub={(time) => setCurrentTime(time)}
								onZoomChange={setZoom}
								onPresetChange={(id) => setActivePresetId(id)}
							/>
						</div>
					</div>
					{!isPortrait && (
						<div
							className="hover:bg-primary w-1 cursor-col-resize bg-neutral-800/70 transition"
							onMouseDown={(e) => {
								e.preventDefault();
								dragState.current = {
									type: "right",
									startX: e.clientX,
									startY: e.clientY,
									startLeft: leftWidth,
									startRight: rightWidth,
									startTop: topHeight,
								};
							}}
						/>
					)}
					<div
						className="flex flex-col border border-neutral-800 bg-neutral-900"
						style={isPortrait ? undefined : { width: rightWidth, minWidth: MIN_RIGHT }}
					>
						<div className="flex h-8 items-center border-b border-neutral-800 bg-neutral-900 px-3 text-xs font-semibold select-none">
							Inspector
						</div>
						<div className="flex flex-1 overflow-hidden">
							<Inspector
								clip={selectedClip}
								clipKind={selectedClipKind}
								onChange={(changes) => selectedClip && handleClipChange(selectedClip.id, changes)}
							/>
						</div>
					</div>
				</div>
				<div
					className="hover:bg-primary h-1 cursor-row-resize bg-neutral-800/70 transition"
					onMouseDown={(e) => {
						e.preventDefault();
						dragState.current = {
							type: "vertical",
							startX: e.clientX,
							startY: e.clientY,
							startLeft: leftWidth,
							startRight: rightWidth,
							startTop: topHeight,
						};
					}}
				/>
				<div
					className="flex flex-col gap-2"
					style={{ height: `calc(100vh - ${topHeight}px - 84px)` }}
				>
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={() => {
									setTimeline((prev) => {
										let nextTracks = [...prev.tracks];
										let trackIndex = nextTracks.findIndex(
											(t) => t.kind === "text" && t.clips.length === 0
										);
										if (trackIndex === -1) {
											nextTracks = [
												...nextTracks,
												{ id: nextTrackId("text", nextTracks), kind: "text", clips: [] },
											];
											trackIndex = nextTracks.length - 1;
										}
										const track = nextTracks[trackIndex];
										const start = currentTime;
										const duration = 3;
										const end = start + duration;
										let nextDuration = prev.duration;
										if (end > prev.duration) {
											nextDuration = Math.ceil(end + 1);
										}
										const clipId = `text_${Date.now()}`;
										const newClip: Clip = {
											id: clipId,
											start,
											end,
											sourceId: "text",
											props: {
												name: "Text",
												text: "Your text",
												font: "Inter",
												size: 24,
												x: 50,
												y: 50,
												color: "#ffffff",
												rotation: 0,
												lineHeight: 1.2,
												letterSpacing: 0,
												anchorX: "center",
												anchorY: "center",
											},
										};
										const updatedTrack: typeof track = {
											...track,
											clips: [...track.clips, newClip],
										};
										nextTracks[trackIndex] = updatedTrack;
										setSelectedClipId(clipId);
										return { ...prev, duration: nextDuration, tracks: nextTracks };
									});
								}}
							>
								Add text clip
							</Button>
							<label className="flex items-center gap-1 text-xs select-none">
								<span>Mode</span>
								<Select
									value={editMode}
									onValueChange={(value) => setEditMode(value as typeof editMode)}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="select">Select</SelectItem>
										<SelectItem value="transform">Transform</SelectItem>
										<SelectItem value="crop">Crop</SelectItem>
										<SelectItem value="distort">Distort</SelectItem>
									</SelectContent>
								</Select>
							</label>
						</div>
					</div>
					<div className="min-h-0 flex-1">
						<TimelineView
							timeline={timeline}
							selectedClipId={selectedClipId}
							currentTime={currentTime}
							zoom={zoom}
							snapEnabled={snapEnabled}
							onToggleSnap={setSnapEnabled}
							onTimeChange={(time) => setCurrentTime(time)}
							onSelectClip={(id) => setSelectedClipId(id)}
							onMoveClip={(clipId, trackId, start) => {
								setTimeline((prev) => {
									let nextDuration = prev.duration;
									let movingClip: Clip | null = null;
									let sourceKind: Track["kind"] | null = null;

									// remove clip from source track
									let workingTracks = prev.tracks.map((track) => {
										const filtered = track.clips.filter((clip) => {
											if (clip.id === clipId) {
												movingClip = clip;
												sourceKind = track.kind;
												return false;
											}
											return true;
										});
										return { ...track, clips: filtered };
									});

									if (!movingClip || !sourceKind) return prev;

									const targetIndex = workingTracks.findIndex((t) => t.id === trackId);
									if (targetIndex === -1) {
										// restore original position
										return prev;
									}

									const targetTrack = workingTracks[targetIndex];
									if (targetTrack.kind !== sourceKind) {
										return prev;
									}

									const duration = (movingClip as Clip).end - (movingClip as Clip).start;
									const nextStart = Math.max(0, start);
									let nextEnd = nextStart + duration;
									if (nextEnd > nextDuration) {
										nextDuration = Math.ceil(nextEnd + 1);
									}
									if (nextEnd > nextDuration) {
										nextEnd = nextDuration;
									}

									const overlap = targetTrack.clips.some(
										(clip) => nextStart < clip.end && nextEnd > clip.start
									);
									if (overlap) {
										return prev;
									}

									const updatedClip: Clip = {
										...(movingClip as Clip),
										start: nextStart,
										end: nextEnd,
									};
									workingTracks[targetIndex] = {
										...targetTrack,
										clips: [...targetTrack.clips, updatedClip],
									};

									// remove any empty tracks
									workingTracks = workingTracks.filter((t) => t.clips.length > 0);

									return { ...prev, duration: nextDuration, tracks: workingTracks };
								});
							}}
							onDropMedia={({ dataTransfer, seconds }) => {
								const startTime = Math.max(0, seconds);
								const mediaId = dataTransfer.getData(MEDIA_DRAG_TYPE);
								if (mediaId) {
									const item = mediaItems.find((m) => m.id === mediaId);
									if (item) {
										handleAddClipFromMedia(item, startTime);
										return;
									}
								}
								const files = dataTransfer.files;
								if (files && files.length > 0) {
									handleImportMedia(files, { autoAdd: true, startTime });
								}
							}}
							onDeleteClip={(clipId) => {
								setTimeline((prev) => {
									const nextTracks = prev.tracks
										.map((track) => ({
											...track,
											clips: track.clips.filter((c) => c.id !== clipId),
										}))
										.filter((track) => track.clips.length > 0);
									return { ...prev, tracks: nextTracks };
								});
								if (selectedClipId === clipId) {
									setSelectedClipId(null);
								}
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function EditorPage() {
	return (
		<Suspense fallback={<LoadingScreen />}>
			<EditorPageContent />
		</Suspense>
	);
}
