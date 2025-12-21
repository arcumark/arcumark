"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline, Track } from "@/lib/shared/timeline";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

type Props = {
	timeline: Timeline;
	selectedClipId: string | null;
	currentTime: number;
	zoom: number;
	onTimeChange: (time: number) => void;
	onSelectClip: (clipId: string) => void;
	onMoveClip: (clipId: string, trackId: string, start: number) => void;
	onDropMedia: (payload: { dataTransfer: DataTransfer; seconds: number; trackId?: string }) => void;
	snapEnabled: boolean;
	onToggleSnap: (enabled: boolean) => void;
	onDeleteClip: (clipId: string) => void;
};

function trackBadgeClass(kind: Track["kind"]) {
	if (kind === "audio") return "h-6 w-2 bg-emerald-500";
	if (kind === "text") return "h-6 w-2 bg-purple-500";
	return "h-6 w-2 bg-blue-500";
}

export function TimelineView({
	timeline,
	selectedClipId,
	currentTime,
	zoom,
	onTimeChange,
	onSelectClip,
	onMoveClip,
	onDropMedia,
	snapEnabled,
	onToggleSnap,
	onDeleteClip,
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
	const isDraggingRef = useRef(false);
	const isScrubbingRef = useRef(false);

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

	const handleCanvasClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!canvasRef.current || safeDuration <= 0) return;
			const rect = canvasRef.current.getBoundingClientRect();
			const ratio = (event.clientX - rect.left + canvasRef.current.scrollLeft) / width;
			const next = Math.max(0, Math.min(1, ratio)) * safeDuration;
			onTimeChange(next);
			onSelectClip("");
		},
		[onTimeChange, onSelectClip, safeDuration, width]
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
			setPreview(null);
		};
		const handleKey = (event: KeyboardEvent) => {
			if (!selectedClipId) return;
			const target = event.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) {
					return;
				}
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				onDeleteClip(selectedClipId);
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
		selectedClipId,
		snapEnabled,
		snapTime,
		safeDuration,
		timeline.tracks,
		width,
	]);

	return (
		<div className="flex h-full flex-col border border-neutral-800 bg-neutral-900">
			<div className="grid flex-1 grid-cols-[160px_1fr] overflow-hidden">
				<div className="sticky left-0 flex h-full min-h-0 flex-col border-r border-neutral-800 bg-neutral-900">
					<div className="flex h-[36px] items-center justify-between border-b border-neutral-800 pr-2 pl-3 text-xs">
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
									className="flex h-12 items-center justify-between border-b border-neutral-800 px-3"
								>
									<div className="flex items-center gap-2">
										<div className={trackBadgeClass(track.kind)} />
										<div className="text-xs tracking-tight">{track.id.toUpperCase()}</div>
									</div>
									<div className="flex gap-1">
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
				<div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-neutral-950">
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
							className="sticky top-0 z-20 flex h-[36px] items-center border-b border-neutral-800 bg-neutral-900 text-xs"
							style={{ width }}
						>
							{markers.map((value) => {
								const markWidth = rulerStep * (width / safeDuration);
								return (
									<div
										key={value}
										className="flex h-[36px] items-center border-r border-neutral-800 pl-1 select-none"
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
							{timeline.tracks.map((track) => (
								<div
									key={track.id}
									className="relative h-12 border-b border-neutral-900 select-none"
								>
									{preview?.trackId === track.id && (
										<div
											className="absolute top-1 h-9 border border-dashed border-blue-400/70 bg-blue-500/10"
											style={{ left: preview.left, width: preview.width }}
											aria-hidden
										/>
									)}
									{track.clips.map((clip) => {
										const clipStart = (clip.start / safeDuration) * width;
										const clipEnd = (clip.end / safeDuration) * width;
										const clipWidth = Math.max(clipEnd - clipStart, 6);
										const baseBg =
											track.kind === "audio"
												? "bg-emerald-900/60"
												: track.kind === "text"
													? "bg-purple-900/60"
													: "bg-blue-900/60";
										return (
											<div
												key={clip.id}
												className={`absolute top-1.5 flex h-9 items-center justify-between border px-2 text-xs ${baseBg} ${
													selectedClipId === clip.id
														? "border-blue-500 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.8)]"
														: "border-neutral-800"
												}`}
												style={{ left: clipStart, width: clipWidth }}
												onClick={(e) => {
													e.stopPropagation();
													onSelectClip(clip.id);
												}}
												onMouseDown={(e) => {
													e.stopPropagation();
													isDraggingRef.current = true;
													dragStateRef.current = {
														clipId: clip.id,
														trackId: track.id,
														startOffsetSec: getSecFromClientX(e.clientX) - clip.start,
														duration: clip.end - clip.start,
													};
												}}
											>
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
