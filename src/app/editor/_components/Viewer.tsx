"use client";

import { useCallback, useEffect, useRef } from "react";
import { Clip } from "@/lib/shared/timeline";
import { MediaItem } from "./MediaBrowser";

type PresetOption = { id: string; name: string };

type Props = {
	currentTime: number;
	duration: number;
	isPlaying: boolean;
	zoom: number;
	presetOptions: PresetOption[];
	activePresetId?: string | null;
	activeClip: Clip | null;
	activeSource: MediaItem | null;
	activeAudioClip: Clip | null;
	activeAudioSource: MediaItem | null;
	activeTextClip: Clip | null;
	onScrub: (time: number) => void;
	onZoomChange: (value: number) => void;
	onPresetChange?: (id: string) => void;
};

function formatTimecode(time: number) {
	const totalSeconds = Math.max(0, time);
	const hours = Math.floor(totalSeconds / 3600)
		.toString()
		.padStart(2, "0");
	const minutes = Math.floor((totalSeconds % 3600) / 60)
		.toString()
		.padStart(2, "0");
	const seconds = Math.floor(totalSeconds % 60)
		.toString()
		.padStart(2, "0");
	const frames = Math.floor((totalSeconds % 1) * 30)
		.toString()
		.padStart(2, "0");
	return `${hours}:${minutes}:${seconds}:${frames}`;
}

export function Viewer({
	currentTime,
	duration,
	isPlaying,
	zoom,
	presetOptions,
	activePresetId,
	activeClip,
	activeSource,
	activeAudioClip,
	activeAudioSource,
	activeTextClip,
	onScrub,
	onZoomChange,
	onPresetChange,
}: Props) {
	const scrubRef = useRef<HTMLDivElement | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const scrubbingRef = useRef(false);

	const handleScrub = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			if (!scrubRef.current || duration <= 0) return;
			const rect = scrubRef.current.getBoundingClientRect();
			const ratio = (event.clientX - rect.left) / rect.width;
			const next = Math.max(0, Math.min(1, ratio)) * duration;
			onScrub(next);
		},
		[duration, onScrub]
	);

	useEffect(() => {
		const handleMove = (event: MouseEvent) => {
			if (!scrubbingRef.current || !scrubRef.current || duration <= 0) return;
			const rect = scrubRef.current.getBoundingClientRect();
			const ratio = (event.clientX - rect.left) / rect.width;
			const next = Math.max(0, Math.min(1, ratio)) * duration;
			onScrub(next);
		};
		const handleUp = () => {
			scrubbingRef.current = false;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [duration, onScrub]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video || !activeSource?.url) {
			if (video) {
				video.pause();
				video.removeAttribute("src");
				video.load();
			}
			return;
		}
		const needsSrcUpdate = video.src !== activeSource.url;
		if (needsSrcUpdate) {
			video.src = activeSource.url;
			video.load();
		}
		const clipOffset = activeClip ? Math.max(0, currentTime - activeClip.start) : 0;
		if (!Number.isNaN(clipOffset) && Math.abs(video.currentTime - clipOffset) > 0.1) {
			video.currentTime = clipOffset;
		}
		if (!isPlaying) {
			video.pause();
		} else if (video.paused) {
			video.play().catch(() => {
				/* ignore play errors */
			});
		}
	}, [activeSource?.url, activeClip, currentTime, isPlaying]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio || !activeAudioSource?.url || !activeAudioClip) {
			if (audio) {
				audio.pause();
				audio.removeAttribute("src");
				audio.load();
			}
			return;
		}
		const needsSrcUpdate = audio.src !== activeAudioSource.url;
		if (needsSrcUpdate) {
			audio.src = activeAudioSource.url;
			audio.load();
		}
		const clipOffset = Math.max(0, currentTime - activeAudioClip.start);
		if (!Number.isNaN(clipOffset) && Math.abs(audio.currentTime - clipOffset) > 0.1) {
			audio.currentTime = clipOffset;
		}
		const volume =
			typeof activeAudioClip.props?.volume === "number"
				? Math.min(1, Math.max(0, activeAudioClip.props.volume / 100))
				: 1;
		audio.volume = volume;
		if (!isPlaying) {
			audio.pause();
		} else if (audio.paused) {
			audio.play().catch(() => {
				/* ignore play errors */
			});
		}
	}, [activeAudioSource?.url, activeAudioClip, currentTime, isPlaying]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
				<div>Viewer</div>
				<div className="flex items-center gap-2">
					<select
						className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
						value={activePresetId ?? presetOptions[0]?.id}
						onChange={(e) => onPresetChange?.(e.target.value)}
					>
						{presetOptions.map((preset) => (
							<option key={preset.id} value={preset.id}>
								{preset.name}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="flex flex-1 flex-col gap-3 overflow-hidden bg-neutral-900 p-3">
				<div className="relative flex min-h-[200px] flex-1 items-center justify-center overflow-hidden border border-neutral-800 bg-neutral-950">
					<div className="relative h-full w-full border border-neutral-700 bg-black/70">
						{activeSource?.type === "video" && activeSource.url ? (
							<video ref={videoRef} className="h-full w-full object-contain p-4">
								<track kind="captions" />
							</video>
						) : (
							<div className="flex h-full w-full items-center justify-center text-sm text-neutral-500 select-none">
								Import a video and add it to the timeline to preview.
							</div>
						)}
						{activeTextClip && (
							<div
								className="pointer-events-none absolute"
								style={{
									left: `${typeof activeTextClip.props?.x === "number" ? activeTextClip.props.x : 50}%`,
									top: `${typeof activeTextClip.props?.y === "number" ? activeTextClip.props.y : 50}%`,
									transform: `translate(-50%, -50%) rotate(${typeof activeTextClip.props?.rotation === "number" ? activeTextClip.props.rotation : 0}deg)`,
									transformOrigin: `${typeof activeTextClip.props?.anchorX === "string" ? activeTextClip.props.anchorX : "center"} ${typeof activeTextClip.props?.anchorY === "string" ? activeTextClip.props.anchorY : "center"}`,
									textAlign:
										typeof activeTextClip.props?.align === "string"
											? (activeTextClip.props.align as
													| "left"
													| "center"
													| "right"
													| "justify"
													| "start"
													| "end"
													| undefined)
											: "center",
									lineHeight:
										typeof activeTextClip.props?.lineHeight === "number"
											? activeTextClip.props.lineHeight
											: 1.2,
									letterSpacing:
										typeof activeTextClip.props?.letterSpacing === "number"
											? `${activeTextClip.props.letterSpacing}px`
											: "0px",
									whiteSpace: "pre-wrap",
								}}
							>
								<div className="relative inline-block">
									{typeof activeTextClip.props?.strokeWidth === "number" &&
										typeof activeTextClip.props?.strokeColor === "string" &&
										activeTextClip.props.strokeWidth > 0 && (
											<span
												aria-hidden
												className="pointer-events-none absolute inset-0 select-none"
												style={{
													color:
														typeof activeTextClip.props?.strokeColor === "string"
															? (activeTextClip.props.strokeColor as string)
															: "#000000",
													WebkitTextStroke: `${activeTextClip.props.strokeWidth}px ${activeTextClip.props.strokeColor}`,
													fontFamily:
														typeof activeTextClip.props?.font === "string" &&
														activeTextClip.props.font.length > 0
															? (activeTextClip.props.font as string)
															: "Inter, system-ui, sans-serif",
													fontSize:
														typeof activeTextClip.props?.size === "number"
															? `${activeTextClip.props.size}px`
															: "24px",
												}}
											>
												{typeof activeTextClip.props?.text === "string" &&
												activeTextClip.props.text.length > 0
													? (activeTextClip.props.text as string)
													: "Text"}
											</span>
										)}
									<span
										className="relative z-10"
										style={{
											color:
												typeof activeTextClip.props?.color === "string" &&
												activeTextClip.props.color.length > 0
													? (activeTextClip.props.color as string)
													: "#ffffff",
											fontFamily:
												typeof activeTextClip.props?.font === "string" &&
												activeTextClip.props.font.length > 0
													? (activeTextClip.props.font as string)
													: "Inter, system-ui, sans-serif",
											fontSize:
												typeof activeTextClip.props?.size === "number"
													? `${activeTextClip.props.size}px`
													: "24px",
										}}
									>
										{typeof activeTextClip.props?.text === "string" &&
										activeTextClip.props.text.length > 0
											? (activeTextClip.props.text as string)
											: "Text"}
									</span>
								</div>
							</div>
						)}
						<div className="absolute top-2 right-2 border border-neutral-800 bg-neutral-900/80 px-2 py-1 font-mono text-xs text-neutral-100 select-none">
							{formatTimecode(currentTime)}
						</div>
					</div>
				</div>
				<div
					className="relative h-6 flex-none cursor-pointer border border-neutral-800 bg-neutral-900"
					ref={scrubRef}
					onClick={handleScrub}
					onMouseDown={(e) => {
						scrubbingRef.current = true;
						handleScrub(e);
					}}
				>
					<div className="absolute top-1/2 right-0 left-0 h-[2px] -translate-y-1/2 bg-neutral-700" />
					<div
						className="absolute top-0 h-full w-[2px] bg-blue-500"
						style={{ left: `${(duration === 0 ? 0 : (currentTime / duration) * 100).toFixed(3)}%` }}
					/>
				</div>
				<div className="flex flex-none items-center justify-between text-xs text-neutral-300">
					<div className="select-none">Zoom</div>
					<input
						className="w-40"
						type="range"
						min={0.5}
						max={3}
						step={0.1}
						value={zoom}
						onChange={(e) => onZoomChange(parseFloat(e.target.value))}
					/>
				</div>
				<audio ref={audioRef} className="hidden" />
			</div>
		</div>
	);
}
