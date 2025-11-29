"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline, Track } from "@/lib/shared/timeline";

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
}: Props) {
	const [muteState, setMuteState] = useState<Record<string, boolean>>({});
	const [soloState, setSoloState] = useState<Record<string, boolean>>({});
	const [visibilityState, setVisibilityState] = useState<Record<string, boolean>>({});
	const canvasRef = useRef<HTMLDivElement | null>(null);
	const trackHeight = 48;
	const rulerHeight = 28;
	const timelineContentHeight = useMemo(
		() => timeline.tracks.length * trackHeight + rulerHeight,
		[timeline.tracks.length, trackHeight, rulerHeight]
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

	const safeDuration = Math.max(0.001, timeline.duration);

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
		},
		[onTimeChange, safeDuration, width]
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
			const sec = getSecFromClientX(event.clientX);
			let nextStart = Math.max(0, sec - startOffsetSec);
			if (snapEnabled) {
				const snapStep = 0.5;
				nextStart = Math.round(nextStart / snapStep) * snapStep;
			}
			onMoveClip(clipId, trackId, nextStart);
		};
		const handleUp = () => {
			isDraggingRef.current = false;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [getSecFromClientX, onMoveClip]);

	return (
		<div className="flex h-full flex-col border border-neutral-800 bg-neutral-900">
			<div className="grid h-full grid-cols-[160px_1fr] overflow-hidden">
				<div className="sticky left-0 flex min-h-0 flex-col border-r border-neutral-800 bg-neutral-900">
					<div className="flex h-[36px] items-center justify-between border-b border-neutral-800 pr-2 pl-3 text-[11px] text-neutral-400">
						<span className="text-neutral-200">Ruler</span>
						<label className="flex items-center gap-1 text-[11px] text-neutral-300 select-none">
							<input
								type="checkbox"
								className="accent-blue-500"
								checked={snapEnabled}
								onChange={(e) => onToggleSnap(e.target.checked)}
								aria-label="Toggle snap to grid"
							/>
							Snap
						</label>
					</div>
					<div className="grid auto-rows-[48px]">
						{timeline.tracks.map((track) => (
							<div
								key={track.id}
								className="flex h-12 items-center justify-between border-b border-neutral-800 px-3 text-xs text-neutral-200"
							>
								<div className="flex items-center gap-2">
									<div className={trackBadgeClass(track.kind)} />
									<div className="tracking-tight">{track.id.toUpperCase()}</div>
								</div>
								<div className="flex gap-1">
									<button
										className={`border px-2 py-1 text-[11px] transition ${muteState[track.id] ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
										onClick={() =>
											setMuteState((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
										}
									>
										M
									</button>
									<button
										className={`border px-2 py-1 text-[11px] transition ${soloState[track.id] ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
										onClick={() =>
											setSoloState((prev) => ({ ...prev, [track.id]: !prev[track.id] }))
										}
									>
										S
									</button>
									<button
										className={`border px-2 py-1 text-[11px] transition ${visibilityState[track.id] === false ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
										onClick={() =>
											setVisibilityState((prev) => ({
												...prev,
												[track.id]: prev[track.id] === false ? true : false,
											}))
										}
									>
										V
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
				<div
					className="relative h-full overflow-auto bg-neutral-950"
					onClick={handleCanvasClick}
					ref={canvasRef}
					onDragOver={(e) => {
						e.preventDefault();
						e.dataTransfer.dropEffect = "copy";
					}}
					onDrop={(e) => {
						e.preventDefault();
						if (e.dataTransfer) {
							onDropMedia({ dataTransfer: e.dataTransfer, seconds: getSecFromClientX(e.clientX) });
						}
					}}
				>
					<div
						className="sticky top-0 z-10 flex h-[36px] items-center border-b border-neutral-800 bg-neutral-900"
						style={{ width }}
					>
						{markers.map((value) => {
							const markWidth = rulerStep * (width / safeDuration);
							return (
								<div
									key={value}
									className="flex h-[36px] items-center border-r border-neutral-800 pl-1 text-[11px] text-neutral-400 select-none"
									style={{ width: markWidth }}
								>
									{value}s
								</div>
							);
						})}
					</div>
					<div
						className="relative min-w-[800px]"
						style={{ width, minHeight: timelineContentHeight }}
					>
						<div
							className="absolute top-0 bottom-0 w-[2px] bg-rose-500"
							style={{ left: `${playheadLeft}px` }}
						/>
						{timeline.tracks.map((track) => (
							<div key={track.id} className="relative h-12 border-b border-neutral-900 select-none">
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
											className={`absolute top-1 flex h-9 items-center justify-between border px-2 text-[12px] text-neutral-100 ${baseBg} ${
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
	);
}
