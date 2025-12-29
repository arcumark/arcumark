"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoPreset } from "@arcumark/shared";
import type { Clip } from "@arcumark/shared";
import type { MediaItem } from "./media-browser";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

type PresetOption = VideoPreset;

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
	selectedClipId: string | null;
	selectedClipKind: "video" | "audio" | "text" | null;
	editMode: "select" | "transform" | "crop" | "distort";
	onAdjustClip?: (clipId: string, props: Record<string, unknown>) => void;
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
	selectedClipId,
	selectedClipKind,
	editMode,
	onAdjustClip,
	onScrub,
	onZoomChange,
	onPresetChange,
}: Props) {
	const scrubRef = useRef<HTMLDivElement | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const scrubbingRef = useRef(false);
	const videoContainerRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const frameWrapperRef = useRef<HTMLDivElement | null>(null);
	const transformDragRef = useRef<{
		startX: number;
		startY: number;
		origTx: number;
		origTy: number;
	} | null>(null);
	const cropDragRef = useRef<{
		handle: "top" | "bottom" | "left" | "right";
		startX: number;
		startY: number;
		rect: DOMRect;
		orig: {
			cropTop: number;
			cropRight: number;
			cropBottom: number;
			cropLeft: number;
		};
	} | null>(null);
	const distortDragRef = useRef<{
		corner: "tl" | "tr" | "br" | "bl";
		startX: number;
		startY: number;
		rect: DOMRect;
		orig: {
			tlx: number;
			tly: number;
			trx: number;
			try: number;
			brx: number;
			bry: number;
			blx: number;
			bly: number;
		};
	} | null>(null);
	const activePreset =
		presetOptions.find((preset) => preset.id === activePresetId) ?? presetOptions[0] ?? null;
	const aspectRatioValue = activePreset ? activePreset.width / activePreset.height : 16 / 9;
	const [availableSize, setAvailableSize] = useState<{ width: number; height: number }>({
		width: 0,
		height: 0,
	});
	const frameSize = (() => {
		const width = availableSize.width;
		const height = availableSize.height;
		if (!width || !height) return { width: "100%", height: "auto" };
		let frameWidth = width;
		let frameHeight = frameWidth / aspectRatioValue;
		if (frameHeight > height) {
			frameHeight = height;
			frameWidth = frameHeight * aspectRatioValue;
		}
		return { width: `${frameWidth}px`, height: `${frameHeight}px` };
	})();
	const [contentRect, setContentRect] = useState<{
		width: number;
		height: number;
		left: number;
		top: number;
	}>({
		width: 0,
		height: 0,
		left: 0,
		top: 0,
	});

	const updateContentRect = useCallback(() => {
		const container = videoContainerRef.current;
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		const containerWidth = containerRect.width;
		const containerHeight = containerRect.height;
		if (!containerWidth || !containerHeight) return;
		const video = videoRef.current;
		const naturalAspect =
			video && video.videoWidth > 0 && video.videoHeight > 0
				? video.videoWidth / video.videoHeight
				: null;
		const displayAspect = naturalAspect && naturalAspect > 0 ? naturalAspect : aspectRatioValue;
		let nextWidth = containerWidth;
		let nextHeight = nextWidth / displayAspect;
		if (nextHeight > containerHeight) {
			nextHeight = containerHeight;
			nextWidth = nextHeight * displayAspect;
		}
		const nextLeft = (containerWidth - nextWidth) / 2;
		const nextTop = (containerHeight - nextHeight) / 2;
		setContentRect({ width: nextWidth, height: nextHeight, left: nextLeft, top: nextTop });
	}, [aspectRatioValue]);

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
			if (scrubbingRef.current && scrubRef.current && duration > 0) {
				const rect = scrubRef.current.getBoundingClientRect();
				const ratio = (event.clientX - rect.left) / rect.width;
				const next = Math.max(0, Math.min(1, ratio)) * duration;
				onScrub(next);
			}
			const container = videoContainerRef.current;
			if (!container || !selectedClipId || !onAdjustClip) return;

			// Transform drag
			if (transformDragRef.current) {
				const { startX, startY, origTx, origTy } = transformDragRef.current;
				const dx = event.clientX - startX;
				const dy = event.clientY - startY;
				onAdjustClip(selectedClipId, { tx: origTx + dx, ty: origTy + dy });
			}

			// Crop drag
			if (cropDragRef.current) {
				const { handle, startX, startY, rect, orig } = cropDragRef.current;
				const dxPct = ((event.clientX - startX) / rect.width) * 100;
				const dyPct = ((event.clientY - startY) / rect.height) * 100;
				const next = { ...orig };
				if (handle === "left")
					next.cropLeft = Math.max(0, Math.min(99, (orig.cropLeft ?? 0) + dxPct));
				if (handle === "right")
					next.cropRight = Math.max(0, Math.min(99, (orig.cropRight ?? 0) - dxPct));
				if (handle === "top") next.cropTop = Math.max(0, Math.min(99, (orig.cropTop ?? 0) + dyPct));
				if (handle === "bottom")
					next.cropBottom = Math.max(0, Math.min(99, (orig.cropBottom ?? 0) - dyPct));
				onAdjustClip(selectedClipId, next);
			}

			// Distort drag
			if (distortDragRef.current) {
				const { corner, startX, startY, rect, orig } = distortDragRef.current;
				const dxPct = ((event.clientX - startX) / rect.width) * 100;
				const dyPct = ((event.clientY - startY) / rect.height) * 100;
				const next: typeof orig = { ...orig };
				if (corner === "tl") {
					next.tlx = (orig.tlx ?? 0) + dxPct;
					next.tly = (orig.tly ?? 0) + dyPct;
				} else if (corner === "tr") {
					next.trx = (orig.trx ?? 0) + dxPct;
					next.try = (orig.try ?? 0) + dyPct;
				} else if (corner === "br") {
					next.brx = (orig.brx ?? 0) + dxPct;
					next.bry = (orig.bry ?? 0) + dyPct;
				} else if (corner === "bl") {
					next.blx = (orig.blx ?? 0) + dxPct;
					next.bly = (orig.bly ?? 0) + dyPct;
				}
				onAdjustClip(selectedClipId, next);
			}
		};
		const handleUp = () => {
			scrubbingRef.current = false;
			transformDragRef.current = null;
			cropDragRef.current = null;
			distortDragRef.current = null;
		};
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [duration, onAdjustClip, onScrub, selectedClipId, selectedClipKind]);

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

	useEffect(() => {
		const el = frameWrapperRef.current;
		if (!el) return;
		const updateSize = () => {
			const rect = el.getBoundingClientRect();
			setAvailableSize({ width: rect.width, height: rect.height });
		};
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const container = videoContainerRef.current;
		if (!container) return;
		updateContentRect();
		const observer = new ResizeObserver(() => updateContentRect());
		observer.observe(container);
		return () => observer.disconnect();
	}, [updateContentRect]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		const handleLoaded = () => updateContentRect();
		video.addEventListener("loadedmetadata", handleLoaded);
		return () => video.removeEventListener("loadedmetadata", handleLoaded);
	}, [updateContentRect, activeSource?.url]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="border-border bg-card flex items-center justify-between border-b px-3 py-2 text-xs">
				<div>Viewer</div>
				<div className="flex items-center gap-2">
					<Select
						value={activePresetId ?? presetOptions[0]?.id ?? ""}
						onValueChange={(value) => {
							if (value) {
								onPresetChange?.(value);
							}
						}}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{presetOptions.map((preset) => (
								<SelectItem key={preset.id} value={preset.id}>
									{preset.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="bg-card flex flex-1 flex-col gap-3 overflow-hidden p-3">
				<div className="border-border bg-background relative flex min-h-[200px] flex-1 flex-col border">
					<div className="absolute top-0 left-0 z-10 flex w-full items-center gap-2 px-4 pt-3 pb-2 font-mono text-xs select-none">
						{activePreset && (
							<div className="border-border bg-card/90 border px-2 py-1">
								{activePreset.aspectRatioLabel} • {activePreset.width}x{activePreset.height}
							</div>
						)}
						<div className="border-border bg-card/90 border px-2 py-1 text-right">
							{formatTimecode(currentTime)}
						</div>
					</div>
					<div
						ref={frameWrapperRef}
						className="relative flex h-full max-h-full w-full max-w-full flex-1 items-center justify-center px-4 py-3"
					>
						<div className="relative max-h-full max-w-full" style={frameSize}>
							<div
								ref={videoContainerRef}
								className="relative h-full w-full overflow-hidden border border-neutral-200 bg-white shadow-[0_20px_80px_rgba(0,0,0,0.35)]"
							>
								<div
									ref={contentRef}
									className="absolute"
									style={{
										width: `${contentRect.width}px`,
										height: `${contentRect.height}px`,
										left: `${contentRect.left}px`,
										top: `${contentRect.top}px`,
									}}
								>
									{activeSource?.type === "video" && activeSource.url ? (
										<video
											ref={videoRef}
											className="h-full w-full object-contain"
											style={{
												transform: (() => {
													if (!activeClip) return undefined;
													const tx =
														typeof activeClip.props?.tx === "number" ? activeClip.props.tx : 0;
													const ty =
														typeof activeClip.props?.ty === "number" ? activeClip.props.ty : 0;
													const scale =
														typeof activeClip.props?.scale === "number"
															? activeClip.props.scale
															: 1;
													const transforms = [];
													if (tx !== 0 || ty !== 0) {
														transforms.push(`translate(${tx}px, ${ty}px)`);
													}
													if (scale !== 1) {
														transforms.push(`scale(${scale})`);
													}
													return transforms.length > 0 ? transforms.join(" ") : undefined;
												})(),
												clipPath: (() => {
													const props = activeClip?.props || {};
													if (
														typeof props?.tlx === "number" ||
														typeof props?.tly === "number" ||
														typeof props?.trx === "number" ||
														typeof props?.try === "number" ||
														typeof props?.brx === "number" ||
														typeof props?.bry === "number" ||
														typeof props?.blx === "number" ||
														typeof props?.bly === "number"
													) {
														const tlx = (props.tlx as number) || 0;
														const tly = (props.tly as number) || 0;
														const trx = (props.trx as number) || 0;
														const trY = (props.try as number) || 0;
														const brx = (props.brx as number) || 0;
														const bry = (props.bry as number) || 0;
														const blx = (props.blx as number) || 0;
														const bly = (props.bly as number) || 0;
														return `polygon(${0 + tlx}% ${0 + tly}%, ${100 + trx}% ${0 + trY}%, ${100 + brx}% ${100 + bry}%, ${0 + blx}% ${100 + bly}%)`;
													}
													if (
														typeof props?.cropTop === "number" ||
														typeof props?.cropRight === "number" ||
														typeof props?.cropBottom === "number" ||
														typeof props?.cropLeft === "number"
													) {
														const top = props.cropTop ?? 0;
														const right = props.cropRight ?? 0;
														const bottom = props.cropBottom ?? 0;
														const left = props.cropLeft ?? 0;
														return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
													}
													return undefined;
												})(),
											}}
										>
											<track kind="captions" />
										</video>
									) : (
										<div className="flex h-full w-full items-center justify-center text-xs select-none">
											Import a video and add it to the timeline to preview.
										</div>
									)}
									{editMode === "transform" &&
										selectedClipKind === "video" &&
										activeClip &&
										selectedClipId === activeClip.id &&
										onAdjustClip && (
											<div
												className="absolute inset-0 cursor-move"
												onMouseDown={(e) => {
													e.stopPropagation();
													transformDragRef.current = {
														startX: e.clientX,
														startY: e.clientY,
														origTx: (activeClip.props?.tx as number) || 0,
														origTy: (activeClip.props?.ty as number) || 0,
													};
												}}
											/>
										)}
									{editMode === "crop" &&
										selectedClipKind === "video" &&
										activeClip &&
										selectedClipId === activeClip.id &&
										onAdjustClip && (
											<div className="absolute inset-0">
												{["top", "bottom", "left", "right"].map((handle) => (
													<div
														key={handle}
														className="border-primary bg-primary/10 absolute"
														style={{
															width: handle === "left" || handle === "right" ? "6px" : "100%",
															height: handle === "top" || handle === "bottom" ? "6px" : "100%",
															top: handle === "bottom" ? "auto" : "0",
															bottom: handle === "bottom" ? "0" : "auto",
															left: handle === "right" ? "auto" : "0",
															right: handle === "right" ? "0" : "auto",
															cursor:
																handle === "left" || handle === "right" ? "ew-resize" : "ns-resize",
														}}
														onMouseDown={(e) => {
															e.stopPropagation();
															const rect = contentRef.current?.getBoundingClientRect();
															if (!rect) return;
															cropDragRef.current = {
																handle: handle as "top" | "bottom" | "left" | "right",
																startX: e.clientX,
																startY: e.clientY,
																rect,
																orig: {
																	cropTop: (activeClip.props?.cropTop as number) ?? 0,
																	cropRight: (activeClip.props?.cropRight as number) ?? 0,
																	cropBottom: (activeClip.props?.cropBottom as number) ?? 0,
																	cropLeft: (activeClip.props?.cropLeft as number) ?? 0,
																},
															};
														}}
													/>
												))}
											</div>
										)}
								</div>
								{editMode === "distort" &&
									selectedClipKind === "video" &&
									activeClip &&
									selectedClipId === activeClip.id &&
									onAdjustClip && (
										<div className="absolute inset-0">
											{["tl", "tr", "br", "bl"].map((corner) => (
												<div
													key={corner}
													className="border-primary bg-primary/10 absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 border"
													style={{
														left: corner === "tl" || corner === "bl" ? "0%" : "100%",
														top: corner === "tl" || corner === "tr" ? "0%" : "100%",
														cursor: "grab",
													}}
													onMouseDown={(e) => {
														e.stopPropagation();
														const rect = contentRef.current?.getBoundingClientRect();
														if (!rect) return;
														distortDragRef.current = {
															corner: corner as "tl" | "tr" | "br" | "bl",
															startX: e.clientX,
															startY: e.clientY,
															rect,
															orig: {
																tlx: (activeClip.props?.tlx as number) ?? 0,
																tly: (activeClip.props?.tly as number) ?? 0,
																trx: (activeClip.props?.trx as number) ?? 0,
																try: (activeClip.props?.try as number) ?? 0,
																brx: (activeClip.props?.brx as number) ?? 0,
																bry: (activeClip.props?.bry as number) ?? 0,
																blx: (activeClip.props?.blx as number) ?? 0,
																bly: (activeClip.props?.bly as number) ?? 0,
															},
														};
													}}
												/>
											))}
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
							</div>
						</div>
					</div>
				</div>
				<div
					className="border-border bg-card relative h-6 flex-none cursor-pointer border"
					ref={scrubRef}
					onClick={handleScrub}
					onMouseDown={(e) => {
						scrubbingRef.current = true;
						handleScrub(e);
					}}
				>
					<div className="bg-muted absolute top-1/2 right-0 left-0 h-[2px] -translate-y-1/2" />
					<div
						className="bg-primary absolute top-0 h-full w-[2px]"
						style={{ left: `${(duration === 0 ? 0 : (currentTime / duration) * 100).toFixed(3)}%` }}
					/>
				</div>
				<div className="flex flex-none items-center justify-between text-xs">
					<div className="select-none">Zoom</div>
					<Slider
						className="w-40"
						min={0.5}
						max={3}
						step={0.1}
						value={[zoom]}
						onValueChange={(values) => {
							const val = Array.isArray(values) ? values[0] : values;
							onZoomChange(typeof val === "number" ? val : zoom);
						}}
					/>
				</div>
				<audio ref={audioRef} className="hidden" />
			</div>
		</div>
	);
}
