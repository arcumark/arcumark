"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline, Track, type Clip } from "@arcumark/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Lock, Unlock } from "lucide-react";
import type { EditMode } from "@/lib/shared/editor";

type Props = {
	timeline: Timeline;
	selectedClipId: string | null;
	selectedClipIds?: string[]; // Multiple selection
	currentTime: number;
	zoom: number;
	onTimeChange: (time: number) => void;
	onSelectClip: (clipId: string) => void;
	onSelectClips?: (clipIds: string[]) => void; // Multiple selection handler
	onMoveClip: (clipId: string, trackId: string, start: number) => void;
	onTrimClip?: (clipId: string, side: "left" | "right", newTime: number) => void;
	onRippleTrim?: (clipId: string, side: "left" | "right", newTime: number) => void;
	onRollTrim?: (clipId: string, side: "left" | "right", newTime: number) => void;
	onDropMedia: (payload: { dataTransfer: DataTransfer; seconds: number; trackId?: string }) => void;
	snapEnabled: boolean;
	autoScrollEnabled: boolean;
	onToggleSnap: (enabled: boolean) => void;
	onDeleteClip: (clipId: string) => void;
	onToggleTrackLock?: (trackId: string) => void;
	editMode?: EditMode;
	onSplitClip?: () => void;
};

function trackBadgeClass(kind: Track["kind"]) {
	if (kind === "audio") return "h-6 w-2 bg-emerald-500";
	if (kind === "text") return "h-6 w-2 bg-purple-500";
	if ((kind as string) === "shape") return "h-6 w-2 bg-orange-500";
	return "h-6 w-2 bg-blue-500";
}

export function TimelineView({
	timeline,
	selectedClipId,
	selectedClipIds = [],
	currentTime,
	zoom,
	onTimeChange,
	onSelectClip,
	onSelectClips,
	onMoveClip,
	onTrimClip,
	onRippleTrim,
	onRollTrim,
	onDropMedia,
	snapEnabled,
	autoScrollEnabled,
	onToggleSnap,
	onDeleteClip,
	onToggleTrackLock,
	editMode,
	onSplitClip,
}: Props) {
	const [muteState, setMuteState] = useState<Record<string, boolean>>({});
	const [soloState, setSoloState] = useState<Record<string, boolean>>({});
	const [visibilityState, setVisibilityState] = useState<Record<string, boolean>>({});
	const leftScrollRef = useRef<HTMLDivElement | null>(null);
	const rightScrollRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const trackHeight = 48;
	const headerHeight = 36;
	const [preview, setPreview] = useState<{ trackId: string; left: number; width: number } | null>(
		null
	);
	const timelineContentHeight = useMemo(
		() => timeline.tracks.length * trackHeight,
		[timeline.tracks.length, trackHeight]
	);
	const dragStateRef = useRef<{
		clipId: string;
		trackId: string;
		startOffsetSec: number;
		duration: number;
	}>({
		clipId: "",
		trackId: "",
		startOffsetSec: 0,
		duration: 0,
	});
	const trimStateRef = useRef<{
		clipId: string;
		side: "left" | "right";
		originalStart: number;
		originalEnd: number;
	} | null>(null);
	const isDraggingRef = useRef(false);
	const isScrubbingRef = useRef(false);
	const isTrimmingRef = useRef(false);

	const safeDuration = Math.max(0.001, timeline.duration);

	const snapPoints = useMemo(() => {
		const pts = new Set<number>();
		pts.add(0);
		pts.add(safeDuration);
		for (const track of timeline.tracks) {
			for (const clip of track.clips) {
				pts.add(clip.start);
				pts.add(clip.end);
			}
		}
		return Array.from(pts).sort((a, b) => a - b);
	}, [safeDuration, timeline.tracks]);

	const snapTime = useCallback(
		(sec: number) => {
			if (!snapEnabled) return sec;
			let best = Math.round(sec / 0.5) * 0.5;
			let bestDiff = Math.abs(best - sec);
			const threshold = 0.25;
			for (const p of snapPoints) {
				const diff = Math.abs(p - sec);
				if (diff < threshold && diff < bestDiff) {
					best = p;
					bestDiff = diff;
				}
			}
			return Math.max(0, best);
		},
		[snapEnabled, snapPoints]
	);

	const width = useMemo(() => {
		const base = safeDuration * 40 * zoom;
		return Math.max(base, 1200);
	}, [safeDuration, zoom]);

	const rulerStep = useMemo(() => {
		if (safeDuration <= 30) return 1;
		if (safeDuration <= 120) return 5;
		return 10;
	}, [safeDuration]);

	const markers = useMemo(() => {
		const count = Math.floor(safeDuration / rulerStep) + 1;
		return Array.from({ length: count }, (_, idx) => idx * rulerStep);
	}, [safeDuration, rulerStep]);

	const playheadLeft = (currentTime / safeDuration) * width;

	// Auto-scroll to center playhead when enabled
	useEffect(() => {
		if (!autoScrollEnabled || !canvasRef.current) return;
		const container = canvasRef.current;
		const containerWidth = container.clientWidth;
		const targetScrollLeft = playheadLeft - containerWidth / 2;
		container.scrollLeft = Math.max(0, targetScrollLeft);
	}, [autoScrollEnabled, playheadLeft, currentTime]);

	const handleCanvasClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!canvasRef.current || safeDuration <= 0) return;
			const rect = canvasRef.current.getBoundingClientRect();
			const ratio = (event.clientX - rect.left + canvasRef.current.scrollLeft) / width;
			const next = Math.max(0, Math.min(1, ratio)) * safeDuration;
			onTimeChange(next);
			onSelectClip("");
			if (onSelectClips) onSelectClips([]);
		},
		[onTimeChange, onSelectClip, onSelectClips, safeDuration, width]
	);

	const getSecFromClientX = useCallback(
		(clientX: number) => {
			if (!canvasRef.current || safeDuration <= 0) return 0;
			const rect = canvasRef.current.getBoundingClientRect();
			const ratio = (clientX - rect.left + canvasRef.current.scrollLeft) / width;
			return Math.max(0, Math.min(1, ratio)) * safeDuration;
		},
		[safeDuration, width]
	);

	useEffect(() => {
		const handleMove = (event: MouseEvent) => {
			if (isTrimmingRef.current && trimStateRef.current) {
				const { clipId, side } = trimStateRef.current;
				const sec = getSecFromClientX(event.clientX);
				const snappedSec = snapTime(sec);

				// Use appropriate trim handler based on edit mode
				if (editMode === "ripple" && onRippleTrim) {
					onRippleTrim(clipId, side, snappedSec);
				} else if (editMode === "roll" && onRollTrim) {
					onRollTrim(clipId, side, snappedSec);
				} else if (onTrimClip) {
					onTrimClip(clipId, side, snappedSec);
				}
				return;
			}
			if (!isDraggingRef.current) return;
			const { clipId, trackId, startOffsetSec } = dragStateRef.current;
			if (!canvasRef.current) return;
			const rect = canvasRef.current.getBoundingClientRect();
			const scrollTop = canvasRef.current.scrollTop;
			const y = event.clientY - rect.top + scrollTop - headerHeight;
			const targetIndex = Math.floor(y / trackHeight);
			if (targetIndex < 0 || targetIndex >= timeline.tracks.length) {
				setPreview(null);
				return;
			}
			const targetTrack = timeline.tracks[targetIndex];
			const originTrack = timeline.tracks.find((t) => t.id === trackId);
			if (!originTrack || targetTrack.kind !== originTrack.kind) {
				setPreview(null);
				return;
			}
			const sec = getSecFromClientX(event.clientX);
			const nextStart = snapTime(Math.max(0, sec - startOffsetSec));
			const duration = dragStateRef.current.duration;
			const nextEnd = nextStart + duration;
			const overlap = targetTrack.clips
				.filter((c) => c.id !== clipId)
				.some((c) => nextStart < c.end && nextEnd > c.start);
			if (overlap) {
				setPreview(null);
				return;
			}
			const nextLeft = (nextStart / safeDuration) * width;
			const nextWidth = Math.max((duration / safeDuration) * width, 6);
			setPreview({ trackId: targetTrack.id, left: nextLeft, width: nextWidth });
			onMoveClip(clipId, targetTrack.id, nextStart);
		};
		const handleUp = () => {
			isDraggingRef.current = false;
			isScrubbingRef.current = false;
			isTrimmingRef.current = false;
			trimStateRef.current = null;
			setPreview(null);
		};
		const handleKey = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
					return;
				}
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				if (selectedClipIds && selectedClipIds.length > 0) {
					// Delete multiple clips
					selectedClipIds.forEach((id) => onDeleteClip(id));
					if (onSelectClips) onSelectClips([]);
				} else if (selectedClipId) {
					onDeleteClip(selectedClipId);
				}
			}
			// Multi-select with Shift+Click (handled in clip onClick)
			if (event.key === "Escape") {
				onSelectClip("");
				if (onSelectClips) onSelectClips([]);
			}
		};
		const handleScrubMove = (event: MouseEvent) => {
			if (!isScrubbingRef.current) return;
			const next = Math.max(0, getSecFromClientX(event.clientX));
			onTimeChange(next);
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mousemove", handleScrubMove);
		window.addEventListener("mouseup", handleUp);
		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mousemove", handleScrubMove);
			window.removeEventListener("mouseup", handleUp);
			window.removeEventListener("keydown", handleKey);
		};
	}, [
		getSecFromClientX,
		onDeleteClip,
		onMoveClip,
		onTimeChange,
		onTrimClip,
		onRippleTrim,
		onRollTrim,
		onSelectClip,
		selectedClipId,
		selectedClipIds,
		onSelectClips,
		snapEnabled,
		snapTime,
		safeDuration,
		timeline.tracks,
		width,
		editMode,
	]);

	return (
		<div className="border-border bg-card flex h-full flex-col border">
			<div className="grid flex-1 grid-cols-[240px_1fr] overflow-hidden">
				<div className="border-border bg-card sticky left-0 flex h-full min-h-0 flex-col border-r">
					<div className="border-border flex h-[36px] items-center justify-between border-b pr-2 pl-3 text-xs">
						<span>Ruler</span>
						<label className="flex items-center gap-1 select-none">
							<Checkbox
								checked={snapEnabled}
								onCheckedChange={onToggleSnap}
								aria-label="Toggle snap to grid"
							/>
							Snap
						</label>
					</div>
					<div
						ref={leftScrollRef}
						className="flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
						onScroll={(e) => {
							if (rightScrollRef.current) {
								rightScrollRef.current.scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
							}
						}}
					>
						<div className="grid auto-rows-[48px]">
							{timeline.tracks.map((track) => (
								<div
									key={track.id}
									className="border-border flex h-12 items-center justify-between border-b px-3"
								>
									<div className="flex items-center gap-2">
										<div className={trackBadgeClass(track.kind)} />
										<div className="text-xs tracking-tight">{track.id.toUpperCase()}</div>
									</div>
									<div className="flex items-center gap-1">
										{onToggleTrackLock && (
											<Button
												variant={
													(track as Track & { locked?: boolean }).locked ? "default" : "ghost"
												}
												size="xs"
												onClick={() => onToggleTrackLock(track.id)}
												className="h-6 w-6 p-0"
												title={
													(track as Track & { locked?: boolean }).locked
														? "Unlock track"
														: "Lock track"
												}
											>
												{(track as Track & { locked?: boolean }).locked ? (
													<Lock className="h-3.5 w-3.5" />
												) : (
													<Unlock className="h-3.5 w-3.5" />
												)}
											</Button>
										)}
										<Button
											variant={muteState[track.id] ? "default" : "outline"}
											size="xs"
											disabled={!selectedClipId}
											onClick={() =>
												selectedClipId &&
												setMuteState((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
											}
										>
											M
										</Button>
										<Button
											variant={soloState[track.id] ? "default" : "outline"}
											size="xs"
											disabled={!selectedClipId}
											onClick={() =>
												selectedClipId &&
												setSoloState((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
											}
										>
											S
										</Button>
										<Button
											variant={visibilityState[track.id] === false ? "default" : "outline"}
											size="xs"
											disabled={!selectedClipId}
											onClick={() =>
												selectedClipId &&
												setVisibilityState((prev) => ({
													...prev,
													[track.id]: prev[track.id] === false ? true : false,
												}))
											}
										>
											V
										</Button>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
				<div className="bg-background relative flex h-full min-h-0 flex-col overflow-hidden">
					<div
						ref={(el) => {
							rightScrollRef.current = el;
							canvasRef.current = el;
						}}
						className="flex-1 overflow-auto"
						onScroll={(e) => {
							if (leftScrollRef.current) {
								leftScrollRef.current.scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
							}
						}}
						onClick={handleCanvasClick}
						onMouseDown={(e) => {
							// ignore when starting a clip drag (clip handlers call stopPropagation)
							isScrubbingRef.current = true;
							const next = Math.max(0, getSecFromClientX(e.clientX));
							onTimeChange(next);
						}}
						onDragOver={(e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = "copy";
						}}
						onDrop={(e) => {
							e.preventDefault();
							if (e.dataTransfer) {
								onDropMedia({
									dataTransfer: e.dataTransfer,
									seconds: snapTime(getSecFromClientX(e.clientX)),
								});
							}
						}}
					>
						<div
							className="border-border bg-card sticky top-0 z-20 flex h-[36px] items-center border-b text-xs"
							style={{ width }}
						>
							{markers.map((value) => {
								const markWidth = rulerStep * (width / safeDuration);
								return (
									<div
										key={value}
										className="border-border flex h-[36px] items-center border-r pl-1 select-none"
										style={{ width: markWidth }}
									>
										{value}s
									</div>
								);
							})}
						</div>
						<div
							className="relative min-w-[800px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							style={{ width, minHeight: timelineContentHeight }}
						>
							<div
								className="absolute top-0 bottom-0 z-10 w-[2px] bg-rose-500/50"
								style={{ left: `${playheadLeft}px`, cursor: "ew-resize" }}
								onMouseDown={(e) => {
									e.stopPropagation();
									isScrubbingRef.current = true;
									const next = Math.max(0, getSecFromClientX(e.clientX));
									onTimeChange(next);
								}}
							/>
							{editMode === "cut" && (
								<div
									className="absolute top-0 z-20 flex items-center justify-center"
									style={{ left: `${playheadLeft}px`, transform: "translateX(-50%)" }}
								>
									<Button
										variant="default"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											onSplitClip?.();
										}}
									>
										Split
									</Button>
								</div>
							)}
							{timeline.tracks.map((track) => (
								<div key={track.id} className="border-card relative h-12 border-b select-none">
									{preview?.trackId === track.id && (
										<div
											className="border-primary/70 bg-primary/10 absolute top-1 h-9 border border-dashed"
											style={{ left: preview.left, width: preview.width }}
											aria-hidden
										/>
									)}
									{track.clips.map((clip) => {
										const clipStart = (clip.start / safeDuration) * width;
										const clipEnd = (clip.end / safeDuration) * width;
										const clipWidth = Math.max(clipEnd - clipStart, 6);
										const isSelected = selectedClipId === clip.id;
										const isMultiSelected = selectedClipIds?.includes(clip.id) ?? false;
										const baseBg =
											track.kind === "audio"
												? "bg-emerald-900/60"
												: track.kind === "text"
													? "bg-purple-900/60"
													: (track.kind as string) === "shape"
														? "bg-orange-900/60"
														: "bg-blue-900/60";
										const isLocked = (track as Track & { locked?: boolean }).locked ?? false;
										return (
											<div
												key={clip.id}
												className={`absolute top-1.5 flex h-9 items-center justify-between border px-2 text-xs ${baseBg} ${
													isSelected || isMultiSelected
														? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.8)]"
														: "border-border"
												} ${isLocked ? "opacity-50" : ""} ${editMode === "cut" ? "cursor-crosshair" : "cursor-pointer"}`}
												style={{ left: clipStart, width: clipWidth }}
												onClick={(e) => {
													e.stopPropagation();
													if (e.shiftKey && onSelectClips) {
														// Multi-select with Shift+Click
														const currentIds = selectedClipIds || [];
														if (currentIds.includes(clip.id)) {
															onSelectClips(currentIds.filter((id) => id !== clip.id));
														} else {
															onSelectClips([...currentIds, clip.id]);
														}
													} else {
														onSelectClip(clip.id);
														if (onSelectClips) onSelectClips([clip.id]);
													}
												}}
												onContextMenu={(e) => {
													e.stopPropagation();
													if (editMode === "cut") {
														// Cut mode: split at right-click position
														e.preventDefault();
														const clickTime = getSecFromClientX(e.clientX);
														// Only split within clip bounds
														if (clickTime > clip.start && clickTime < clip.end) {
															onTimeChange(clickTime);
															// Execute split on next frame (after currentTime update)
															setTimeout(() => onSplitClip?.(), 0);
														}
													}
												}}
												onMouseDown={(e) => {
													e.stopPropagation();
													// Disable dragging in cut mode or if track is locked
													if (editMode === "cut" || isLocked) return;

													// Check if clicking on trim handle
													const rect = e.currentTarget.getBoundingClientRect();
													const clickX = e.clientX - rect.left;
													const handleWidth = 6;

													if (clickX < handleWidth && onTrimClip) {
														// Left trim handle
														isTrimmingRef.current = true;
														trimStateRef.current = {
															clipId: clip.id,
															side: "left",
															originalStart: clip.start,
															originalEnd: clip.end,
														};
													} else if (clickX > clipWidth - handleWidth && onTrimClip) {
														// Right trim handle
														isTrimmingRef.current = true;
														trimStateRef.current = {
															clipId: clip.id,
															side: "right",
															originalStart: clip.start,
															originalEnd: clip.end,
														};
													} else {
														// Normal drag
														isDraggingRef.current = true;
														dragStateRef.current = {
															clipId: clip.id,
															trackId: track.id,
															startOffsetSec: getSecFromClientX(e.clientX) - clip.start,
															duration: clip.end - clip.start,
														};
													}
												}}
											>
												{/* Trim Handles */}
												{(isSelected || isMultiSelected) && !isLocked && onTrimClip && (
													<>
														<div
															className="bg-primary hover:bg-primary/80 absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize"
															onMouseDown={(e) => {
																e.stopPropagation();
																isTrimmingRef.current = true;
																trimStateRef.current = {
																	clipId: clip.id,
																	side: "left",
																	originalStart: clip.start,
																	originalEnd: clip.end,
																};
															}}
														/>
														<div
															className="bg-primary hover:bg-primary/80 absolute top-0 right-0 bottom-0 w-1 cursor-ew-resize"
															onMouseDown={(e) => {
																e.stopPropagation();
																isTrimmingRef.current = true;
																trimStateRef.current = {
																	clipId: clip.id,
																	side: "right",
																	originalStart: clip.start,
																	originalEnd: clip.end,
																};
															}}
														/>
													</>
												)}

												{/* Thumbnail Preview */}
												{(clip as Clip & { thumbnailUrl?: string }).thumbnailUrl &&
													track.kind === "video" && (
														<div
															className="absolute top-0 bottom-0 left-0 w-12 overflow-hidden"
															style={{
																backgroundImage: `url(${(clip as Clip & { thumbnailUrl?: string }).thumbnailUrl})`,
																backgroundSize: "cover",
																backgroundPosition: "center",
															}}
														/>
													)}

												{/* Clip Markers */}
												{(
													clip as Clip & {
														markers?: Array<{ id: string; time: number; label?: string }>;
													}
												).markers &&
													(
														clip as Clip & {
															markers?: Array<{ id: string; time: number; label?: string }>;
														}
													).markers!.length > 0 && (
														<div className="absolute top-0 right-0 left-0 flex h-1 gap-0.5">
															{(
																clip as Clip & {
																	markers?: Array<{ id: string; time: number; label?: string }>;
																}
															).markers!.map((marker) => {
																const markerX = (marker.time / (clip.end - clip.start)) * clipWidth;
																return (
																	<div
																		key={marker.id}
																		className="absolute top-0 h-full w-0.5 bg-yellow-400"
																		style={{ left: `${markerX}px` }}
																		title={marker.label || `Marker at ${marker.time.toFixed(2)}s`}
																	/>
																);
															})}
														</div>
													)}
												{/* Fade In Indicator */}
												{typeof clip.props?.fadeIn === "number" && clip.props.fadeIn > 0 && (
													<div
														className="pointer-events-none absolute top-0 bottom-0 left-0 bg-linear-to-r from-amber-500/30 to-transparent"
														style={{
															width: `${Math.min((clip.props.fadeIn / (clip.end - clip.start)) * 100, 100)}%`,
														}}
													/>
												)}

												{/* Fade Out Indicator */}
												{typeof clip.props?.fadeOut === "number" && clip.props.fadeOut > 0 && (
													<div
														className="pointer-events-none absolute top-0 right-0 bottom-0 bg-linear-to-l from-amber-500/30 to-transparent"
														style={{
															width: `${Math.min((clip.props.fadeOut / (clip.end - clip.start)) * 100, 100)}%`,
														}}
													/>
												)}

												<span className="truncate">{clip.id}</span>
												<span>{(clip.end - clip.start).toFixed(1)}s</span>
											</div>
										);
									})}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
