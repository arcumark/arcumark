"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { readAllMediaRecords, type StoredMediaRecord } from "@/lib/client/media-store";
import { VIDEO_PRESETS, type VideoPreset } from "@arcumark/shared";
import { Clip, Timeline, validateTimeline } from "@arcumark/shared";
import { isValidProjectId, projectExistsInLocalStorage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getAudioContext } from "@/lib/audio/audio-context";
import { calculateNormalizeGain } from "@/lib/audio/normalize";
import { generateImpulseResponse } from "@/lib/audio/impulse-response-generator";
import { calculateSourceTime } from "@/lib/timing/speed-utils";
import {
	applyChromaKey,
	applyColorCorrectionSync,
	type ColorCorrectionProps,
	type ChromaKey,
} from "@/lib/color/color-correction";
import {
	WebGLCompositor,
	buildCurvesLutTexture,
	type WipeRect,
	type WebGLClipEffects,
} from "@/lib/rendering/webgl-compositor";
import { getAnimatedProperties, type ClipKeyframes } from "@/lib/animation/keyframes";
import { ArrayBufferTarget as Mp4ArrayBufferTarget, Muxer as Mp4Muxer } from "mp4-muxer";
import { ArrayBufferTarget as WebMArrayBufferTarget, Muxer as WebMMuxer } from "webm-muxer";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from "mediabunny";

// This page is fully client-side and requires no server-side processing
export const dynamic = "force-static";
export const dynamicParams = true;

type LoadedMediaRecord = StoredMediaRecord & { url: string };
type Track = Timeline["tracks"][number];
type MediaStreamTrackGeneratorKind = "video" | "audio";
type MediaStreamTrackGeneratorCtor = new (options: {
	kind: MediaStreamTrackGeneratorKind;
}) => MediaStreamTrack & { writable: WritableStream<VideoFrame | AudioData> };
type ClipDrawFn = (
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	dx: number,
	dy: number,
	dw: number,
	dh: number
) => void;

type PreparedSource =
	| { type: "video"; element: HTMLVideoElement }
	| { type: "image"; element: HTMLImageElement };

function findActiveClipInTracks(tracks: Track[], time: number) {
	for (const track of tracks) {
		const clip = track.clips.find((c) => time >= c.start && time < c.end);
		if (clip) return clip;
	}
	return null;
}

function findActiveTextClipsInTracks(tracks: Track[], time: number) {
	return tracks.flatMap((track) =>
		track.clips.filter((clip) => time >= clip.start && time < clip.end)
	);
}

function calculateActualDuration(timeline: Timeline): number {
	let maxEnd = 0;
	for (const track of timeline.tracks) {
		for (const clip of track.clips) {
			if (clip.end > maxEnd) {
				maxEnd = clip.end;
			}
		}
	}
	return maxEnd > 0 ? maxEnd : timeline.duration;
}

function clampOpacity(value: unknown, fallback = 100) {
	if (typeof value !== "number" || Number.isNaN(value)) return fallback;
	return Math.min(100, Math.max(0, value));
}

function applyWipeClip(
	ctx: CanvasRenderingContext2D,
	direction: string,
	progress: number,
	width: number,
	height: number
) {
	ctx.beginPath();
	switch (direction) {
		case "left":
			ctx.rect(0, 0, width * progress, height);
			break;
		case "right":
			ctx.rect(width * (1 - progress), 0, width * progress, height);
			break;
		case "up":
			ctx.rect(0, height * (1 - progress), width, height * progress);
			break;
		case "down":
			ctx.rect(0, 0, width, height * progress);
			break;
	}
	ctx.clip();
}

function drawClipWithRenderer(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	clip: Clip,
	timeSec: number,
	mediaWidth: number,
	mediaHeight: number,
	draw: ClipDrawFn
) {
	const props = clip.props || {};
	const cropTop = typeof props.cropTop === "number" ? props.cropTop : 0;
	const cropRight = typeof props.cropRight === "number" ? props.cropRight : 0;
	const cropBottom = typeof props.cropBottom === "number" ? props.cropBottom : 0;
	const cropLeft = typeof props.cropLeft === "number" ? props.cropLeft : 0;
	const sx = (cropLeft / 100) * mediaWidth;
	const sy = (cropTop / 100) * mediaHeight;
	const sw = Math.max(1, mediaWidth - sx - (cropRight / 100) * mediaWidth);
	const sh = Math.max(1, mediaHeight - sy - (cropBottom / 100) * mediaHeight);

	const mediaAspect = sw / sh;
	const canvasAspect = canvas.width / canvas.height;
	let dw = canvas.width;
	let dh = canvas.height;
	if (mediaAspect > canvasAspect) {
		dh = canvas.width / mediaAspect;
		dw = canvas.width;
	} else {
		dw = canvas.height * mediaAspect;
		dh = canvas.height;
	}
	// Calculate clip-relative time for keyframes
	const clipProgress = timeSec - clip.start;
	const clipDuration = clip.end - clip.start;
	const clipRemaining = clip.end - timeSec;

	// Get default transform values
	const defaultTx = typeof props.tx === "number" ? props.tx : 0;
	const defaultTy = typeof props.ty === "number" ? props.ty : 0;
	const defaultScale = typeof props.scale === "number" ? props.scale : 1;

	// Apply keyframe animations if present
	let tx = defaultTx;
	let ty = defaultTy;
	let scale = defaultScale;

	const keyframes = props.keyframes as ClipKeyframes | undefined;
	if (keyframes && clipProgress >= 0 && clipProgress <= clipDuration) {
		const animatedProps = getAnimatedProperties(keyframes, clipProgress, {
			tx: defaultTx,
			ty: defaultTy,
			scale: defaultScale,
		});
		tx = animatedProps.tx ?? defaultTx;
		ty = animatedProps.ty ?? defaultTy;
		scale = animatedProps.scale ?? defaultScale;
	}

	// Apply scale to dimensions
	dw *= scale;
	dh *= scale;

	const dx = (canvas.width - dw) / 2 + tx;
	const dy = (canvas.height - dh) / 2 + ty;

	ctx.save();

	// Apply wipe clipping
	const wipeIn = (props.wipeIn as number) || 0;
	const wipeOut = (props.wipeOut as number) || 0;
	const wipeDirection = props.wipeDirection as string;

	if (wipeIn > 0 && clipProgress < wipeIn && wipeDirection) {
		const progress = clipProgress / wipeIn;
		applyWipeClip(ctx, wipeDirection, progress, canvas.width, canvas.height);
	} else if (wipeOut > 0 && clipRemaining < wipeOut && wipeDirection) {
		const progress = 1 - clipRemaining / wipeOut;
		applyWipeClip(ctx, wipeDirection, 1 - progress, canvas.width, canvas.height);
	}

	// Apply effects filters
	const filters = [];
	const brightness = 1 + ((props.brightness as number) || 0) / 100;
	const contrast = 1 + ((props.contrast as number) || 0) / 100;
	const saturation = 1 + ((props.saturation as number) || 0) / 100;
	const blur = (props.blur as number) || 0;

	if (brightness !== 1) filters.push(`brightness(${brightness})`);
	if (contrast !== 1) filters.push(`contrast(${contrast})`);
	if (saturation !== 1) filters.push(`saturate(${saturation})`);
	if (blur > 0) filters.push(`blur(${blur}px)`);

	ctx.filter = filters.length > 0 ? filters.join(" ") : "none";

	// Calculate fade transition opacity
	let opacityMultiplier = 1.0;
	const fadeIn = Math.min((props.fadeIn as number) || 0, clip.end - clip.start);
	const fadeOut = Math.min((props.fadeOut as number) || 0, clip.end - clip.start);

	if (fadeIn > 0 && clipProgress < fadeIn) {
		opacityMultiplier = Math.max(0, Math.min(1, clipProgress / fadeIn));
	} else if (fadeOut > 0 && clipRemaining < fadeOut) {
		opacityMultiplier = Math.max(0, Math.min(1, clipRemaining / fadeOut));
	}

	// Get base opacity (with keyframe animation if present)
	let baseOpacity = clampOpacity(props.opacity, 100) / 100;

	if (keyframes && clipProgress >= 0 && clipProgress <= clipDuration) {
		const opacityProps = getAnimatedProperties(keyframes, clipProgress, {
			opacity: baseOpacity * 100,
		});
		if (opacityProps.opacity !== undefined) {
			baseOpacity = opacityProps.opacity / 100;
		}
	}

	ctx.globalAlpha = baseOpacity * opacityMultiplier;

	draw(sx, sy, sw, sh, dx, dy, dw, dh);

	// Apply color correction if present (synchronous for export)
	const colorCorrection: ColorCorrectionProps = {};
	if (props.colorWheel && typeof props.colorWheel === "object") {
		colorCorrection.colorWheel = props.colorWheel as ColorCorrectionProps["colorWheel"];
	}
	if (props.curves && typeof props.curves === "object") {
		colorCorrection.curves = props.curves as ColorCorrectionProps["curves"];
	}
	if (props.levels && typeof props.levels === "object") {
		colorCorrection.levels = props.levels as ColorCorrectionProps["levels"];
	}
	if (props.whiteBalance && typeof props.whiteBalance === "object") {
		colorCorrection.whiteBalance = props.whiteBalance as ColorCorrectionProps["whiteBalance"];
	}
	// Note: LUT is async and will be skipped during export for performance
	// if (props.lutUrl) colorCorrection.lutUrl = props.lutUrl as string;

	const hasColorCorrection =
		colorCorrection.colorWheel ||
		colorCorrection.curves ||
		colorCorrection.levels ||
		colorCorrection.whiteBalance;

	// Apply chroma key if enabled (before color correction)
	const chromaKey = clip.props?.chromaKey as ChromaKey | undefined;
	if (chromaKey?.enabled) {
		const x = Math.floor(dx);
		const y = Math.floor(dy);
		const w = Math.ceil(dw);
		const h = Math.ceil(dh);
		const imageData = ctx.getImageData(x, y, w, h);
		const chromaKeyedData = applyChromaKey(imageData, chromaKey);
		ctx.putImageData(chromaKeyedData, x, y);
	}

	if (hasColorCorrection) {
		// Get image data from the drawn area (convert to integers for getImageData)
		const x = Math.floor(dx);
		const y = Math.floor(dy);
		const w = Math.ceil(dw);
		const h = Math.ceil(dh);
		const imageData = ctx.getImageData(x, y, w, h);
		const correctedData = applyColorCorrectionSync(imageData, colorCorrection);
		ctx.putImageData(correctedData, x, y);
	}

	ctx.restore();
}

function drawClipToCanvas(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	clip: Clip,
	element: HTMLVideoElement | HTMLImageElement,
	timeSec: number
) {
	const mediaWidth =
		element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth || canvas.width;
	const mediaHeight =
		element instanceof HTMLVideoElement
			? element.videoHeight
			: element.naturalHeight || canvas.height;
	drawClipWithRenderer(
		ctx,
		canvas,
		clip,
		timeSec,
		mediaWidth,
		mediaHeight,
		(sx, sy, sw, sh, dx, dy, dw, dh) => ctx.drawImage(element, sx, sy, sw, sh, dx, dy, dw, dh)
	);
}

function drawSampleToCanvas(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	clip: Clip,
	sample: VideoSample,
	timeSec: number
) {
	const mediaWidth = sample.displayWidth || sample.codedWidth || canvas.width;
	const mediaHeight = sample.displayHeight || sample.codedHeight || canvas.height;
	drawClipWithRenderer(
		ctx,
		canvas,
		clip,
		timeSec,
		mediaWidth,
		mediaHeight,
		(sx, sy, sw, sh, dx, dy, dw, dh) => sample.draw(ctx, sx, sy, sw, sh, dx, dy, dw, dh)
	);
}

type ClipRenderParams = {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	dx: number;
	dy: number;
	dw: number;
	dh: number;
	opacity: number;
	brightness: number;
	contrast: number;
	saturation: number;
	blur: number;
	wipeRect: WipeRect;
	colorCorrection: ColorCorrectionProps;
	chromaKey?: ChromaKey;
	distort?: {
		tlx: number;
		tly: number;
		trx: number;
		try: number;
		brx: number;
		bry: number;
		blx: number;
		bly: number;
	};
};

function computeWipeRect(
	direction: string,
	progress: number,
	canvasWidth: number,
	canvasHeight: number
): WipeRect {
	const clamped = Math.max(0, Math.min(1, progress));
	if (canvasWidth <= 0 || canvasHeight <= 0) return null;
	switch (direction) {
		case "left":
			return { x0: 0, y0: 0, x1: clamped, y1: 1 };
		case "right":
			return { x0: 1 - clamped, y0: 0, x1: 1, y1: 1 };
		case "up":
			return { x0: 0, y0: 1 - clamped, x1: 1, y1: 1 };
		case "down":
			return { x0: 0, y0: 0, x1: 1, y1: clamped };
		default:
			return null;
	}
}

function computeClipRenderParams(
	clip: Clip,
	timeSec: number,
	canvasWidth: number,
	canvasHeight: number,
	mediaWidth: number,
	mediaHeight: number
): ClipRenderParams {
	const props = clip.props || {};
	const cropTop = typeof props.cropTop === "number" ? props.cropTop : 0;
	const cropRight = typeof props.cropRight === "number" ? props.cropRight : 0;
	const cropBottom = typeof props.cropBottom === "number" ? props.cropBottom : 0;
	const cropLeft = typeof props.cropLeft === "number" ? props.cropLeft : 0;
	const sx = (cropLeft / 100) * mediaWidth;
	const sy = (cropTop / 100) * mediaHeight;
	const sw = Math.max(1, mediaWidth - sx - (cropRight / 100) * mediaWidth);
	const sh = Math.max(1, mediaHeight - sy - (cropBottom / 100) * mediaHeight);

	const mediaAspect = sw / sh;
	const canvasAspect = canvasWidth / canvasHeight;
	let dw = canvasWidth;
	let dh = canvasHeight;
	if (mediaAspect > canvasAspect) {
		dh = canvasWidth / mediaAspect;
		dw = canvasWidth;
	} else {
		dw = canvasHeight * mediaAspect;
		dh = canvasHeight;
	}

	const clipProgress = timeSec - clip.start;
	const clipDuration = clip.end - clip.start;
	const clipRemaining = clip.end - timeSec;

	const defaultTx = typeof props.tx === "number" ? props.tx : 0;
	const defaultTy = typeof props.ty === "number" ? props.ty : 0;
	const defaultScale = typeof props.scale === "number" ? props.scale : 1;

	let tx = defaultTx;
	let ty = defaultTy;
	let scale = defaultScale;

	const keyframes = props.keyframes as ClipKeyframes | undefined;
	if (keyframes && clipProgress >= 0 && clipProgress <= clipDuration) {
		const animatedProps = getAnimatedProperties(keyframes, clipProgress, {
			tx: defaultTx,
			ty: defaultTy,
			scale: defaultScale,
		});
		tx = animatedProps.tx ?? defaultTx;
		ty = animatedProps.ty ?? defaultTy;
		scale = animatedProps.scale ?? defaultScale;
	}

	dw *= scale;
	dh *= scale;

	const dx = (canvasWidth - dw) / 2 + tx;
	const dy = (canvasHeight - dh) / 2 + ty;

	let opacityMultiplier = 1.0;
	const fadeIn = Math.min((props.fadeIn as number) || 0, clip.end - clip.start);
	const fadeOut = Math.min((props.fadeOut as number) || 0, clip.end - clip.start);

	if (fadeIn > 0 && clipProgress < fadeIn) {
		opacityMultiplier = Math.max(0, Math.min(1, clipProgress / fadeIn));
	} else if (fadeOut > 0 && clipRemaining < fadeOut) {
		opacityMultiplier = Math.max(0, Math.min(1, clipRemaining / fadeOut));
	}

	let baseOpacity = clampOpacity(props.opacity, 100) / 100;
	if (keyframes && clipProgress >= 0 && clipProgress <= clipDuration) {
		const opacityProps = getAnimatedProperties(keyframes, clipProgress, {
			opacity: baseOpacity * 100,
		});
		if (opacityProps.opacity !== undefined) {
			baseOpacity = opacityProps.opacity / 100;
		}
	}

	const brightness = 1 + ((props.brightness as number) || 0) / 100;
	const contrast = 1 + ((props.contrast as number) || 0) / 100;
	const saturation = 1 + ((props.saturation as number) || 0) / 100;
	const blur = (props.blur as number) || 0;

	const wipeIn = (props.wipeIn as number) || 0;
	const wipeOut = (props.wipeOut as number) || 0;
	const wipeDirection = props.wipeDirection as string;
	let wipeRect: WipeRect = null;
	if (wipeIn > 0 && clipProgress < wipeIn && wipeDirection) {
		wipeRect = computeWipeRect(wipeDirection, clipProgress / wipeIn, canvasWidth, canvasHeight);
	} else if (wipeOut > 0 && clipRemaining < wipeOut && wipeDirection) {
		wipeRect = computeWipeRect(wipeDirection, clipRemaining / wipeOut, canvasWidth, canvasHeight);
	}

	const colorCorrection: ColorCorrectionProps = {};
	if (props.colorWheel && typeof props.colorWheel === "object") {
		colorCorrection.colorWheel = props.colorWheel as ColorCorrectionProps["colorWheel"];
	}
	if (props.curves && typeof props.curves === "object") {
		colorCorrection.curves = props.curves as ColorCorrectionProps["curves"];
	}
	if (props.levels && typeof props.levels === "object") {
		colorCorrection.levels = props.levels as ColorCorrectionProps["levels"];
	}
	if (props.whiteBalance && typeof props.whiteBalance === "object") {
		colorCorrection.whiteBalance = props.whiteBalance as ColorCorrectionProps["whiteBalance"];
	}

	const hasDistort =
		typeof props.tlx === "number" ||
		typeof props.tly === "number" ||
		typeof props.trx === "number" ||
		typeof props.try === "number" ||
		typeof props.brx === "number" ||
		typeof props.bry === "number" ||
		typeof props.blx === "number" ||
		typeof props.bly === "number";

	return {
		sx,
		sy,
		sw,
		sh,
		dx,
		dy,
		dw,
		dh,
		opacity: baseOpacity * opacityMultiplier,
		brightness,
		contrast,
		saturation,
		blur,
		wipeRect,
		colorCorrection,
		chromaKey: clip.props?.chromaKey as ChromaKey | undefined,
		distort: hasDistort
			? {
					tlx: (props.tlx as number) || 0,
					tly: (props.tly as number) || 0,
					trx: (props.trx as number) || 0,
					try: (props.try as number) || 0,
					brx: (props.brx as number) || 0,
					bry: (props.bry as number) || 0,
					blx: (props.blx as number) || 0,
					bly: (props.bly as number) || 0,
				}
			: undefined,
	};
}

function buildClipPositions(
	params: ClipRenderParams,
	canvasWidth: number,
	canvasHeight: number
): Float32Array {
	let tlx = params.dx;
	let tly = params.dy;
	let trx = params.dx + params.dw;
	let tryy = params.dy;
	let brx = params.dx + params.dw;
	let bry = params.dy + params.dh;
	let blx = params.dx;
	let bly = params.dy + params.dh;

	if (params.distort) {
		tlx += (params.distort.tlx / 100) * params.dw;
		tly += (params.distort.tly / 100) * params.dh;
		trx += (params.distort.trx / 100) * params.dw;
		tryy += (params.distort.try / 100) * params.dh;
		brx += (params.distort.brx / 100) * params.dw;
		bry += (params.distort.bry / 100) * params.dh;
		blx += (params.distort.blx / 100) * params.dw;
		bly += (params.distort.bly / 100) * params.dh;
	}

	const toNdcX = (x: number) => (x / canvasWidth) * 2 - 1;
	const toNdcY = (y: number) => 1 - (y / canvasHeight) * 2;

	return new Float32Array([
		toNdcX(tlx),
		toNdcY(tly),
		toNdcX(blx),
		toNdcY(bly),
		toNdcX(trx),
		toNdcY(tryy),
		toNdcX(brx),
		toNdcY(bry),
	]);
}

function buildClipUVs(
	params: ClipRenderParams,
	mediaWidth: number,
	mediaHeight: number
): Float32Array {
	const u0 = params.sx / mediaWidth;
	const v0 = params.sy / mediaHeight;
	const u1 = (params.sx + params.sw) / mediaWidth;
	const v1 = (params.sy + params.sh) / mediaHeight;

	return new Float32Array([u0, v0, u0, v1, u1, v0, u1, v1]);
}

function drawTextClip(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	clip: Clip,
	timeSec: number
) {
	const props = clip.props || {};
	const text =
		typeof props.text === "string" && props.text.length > 0 ? (props.text as string) : "Text";
	const size = typeof props.size === "number" ? props.size : 24;
	const color =
		typeof props.color === "string" && props.color.length > 0 ? (props.color as string) : "#ffffff";
	const strokeWidth = typeof props.strokeWidth === "number" ? props.strokeWidth : 0;
	const strokeColor =
		typeof props.strokeColor === "string" && props.strokeColor.length > 0
			? (props.strokeColor as string)
			: "#000000";
	const lineHeight = typeof props.lineHeight === "number" ? props.lineHeight : 1.2;
	const align =
		typeof props.align === "string" && ["left", "center", "right"].includes(props.align)
			? (props.align as CanvasTextAlign)
			: "center";

	// Calculate clip-relative time for keyframes
	const clipProgress = timeSec - clip.start;
	const clipDuration = clip.end - clip.start;
	const clipRemaining = clip.end - timeSec;

	// Get default values
	const defaultRotation = typeof props.rotation === "number" ? props.rotation : 0;
	const defaultX = typeof props.x === "number" ? props.x : 50;
	const defaultY = typeof props.y === "number" ? props.y : 50;
	const defaultOpacity = clampOpacity(props.opacity, 100);

	// Apply keyframe animations if present
	let rotation = defaultRotation;
	let xPct = defaultX;
	let yPct = defaultY;
	let opacity = defaultOpacity;

	const textKeyframes = props.keyframes as ClipKeyframes | undefined;
	if (textKeyframes && clipProgress >= 0 && clipProgress <= clipDuration) {
		const animatedProps = getAnimatedProperties(textKeyframes, clipProgress, {
			rotation: defaultRotation,
			x: defaultX,
			y: defaultY,
			opacity: defaultOpacity,
		});
		rotation = animatedProps.rotation ?? defaultRotation;
		xPct = animatedProps.x ?? defaultX;
		yPct = animatedProps.y ?? defaultY;
		opacity = animatedProps.opacity ?? defaultOpacity;
	}

	const posX = (xPct / 100) * canvas.width;
	const posY = (yPct / 100) * canvas.height;
	const lines = text.split("\n");

	// Calculate fade transition opacity
	let opacityMultiplier = 1.0;

	const fadeIn = Math.min((props.fadeIn as number) || 0, clip.end - clip.start);
	const fadeOut = Math.min((props.fadeOut as number) || 0, clip.end - clip.start);

	if (fadeIn > 0 && clipProgress < fadeIn) {
		opacityMultiplier = Math.max(0, Math.min(1, clipProgress / fadeIn));
	} else if (fadeOut > 0 && clipRemaining < fadeOut) {
		opacityMultiplier = Math.max(0, Math.min(1, clipRemaining / fadeOut));
	}

	// Use opacity from keyframe animation (already calculated above)
	const baseOpacity = opacity / 100;

	ctx.save();
	ctx.translate(posX, posY);
	ctx.rotate((rotation * Math.PI) / 180);
	ctx.textAlign = align;
	ctx.textBaseline = "middle";
	ctx.globalAlpha = baseOpacity * opacityMultiplier;
	ctx.fillStyle = color;
	ctx.font = `${size}px ${
		typeof props.font === "string" && props.font.length > 0
			? props.font
			: "Inter, system-ui, sans-serif"
	}`;

	lines.forEach((line, idx) => {
		const offset = (idx - (lines.length - 1) / 2) * size * lineHeight;
		if (strokeWidth > 0) {
			ctx.lineWidth = strokeWidth * 2;
			ctx.strokeStyle = strokeColor;
			ctx.strokeText(line, 0, offset);
		}
		ctx.fillText(line, 0, offset);
	});
	ctx.restore();
}

function ExportPageContent() {
	const searchParams = useSearchParams();
	const projectId = searchParams?.get("id");

	const [timeline] = useState<Timeline | null>(() => {
		if (!projectId) return null;
		if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
		try {
			const stored = localStorage.getItem(`arcumark:timeline:${projectId}`);
			if (stored) {
				const parsed = JSON.parse(stored);
				const validation = validateTimeline(parsed);
				if (validation.ok) {
					return validation.timeline;
				}
			}
		} catch (e) {
			console.error("Failed to load timeline", e);
		}
		return null;
	});
	const [validationResult, setValidationResult] = useState<string | null>(null);
	const [adviceResult, setAdviceResult] = useState<string[] | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [presets] = useState<VideoPreset[]>(VIDEO_PRESETS);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
		VIDEO_PRESETS[0]?.id ?? null
	);
	const [mediaRecords, setMediaRecords] = useState<LoadedMediaRecord[]>([]);
	const [isExporting, setIsExporting] = useState(false);
	const [progress, setProgress] = useState(0);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [downloadExtension, setDownloadExtension] = useState<"webm" | "mp4">("webm");
	const [exportError, setExportError] = useState<string | null>(null);
	const [exportFormat, setExportFormat] = useState<"webm" | "mp4">("webm");
	const [projectExists, setProjectExists] = useState<boolean | null>(null);
	const [mounted, setMounted] = useState(false);
	const [previewFlipY, setPreviewFlipY] = useState(false);

	useEffect(() => {
		setMounted(true);
		// Update export format based on browser capabilities after mount
		if (typeof VideoEncoder !== "undefined") {
			setExportFormat("mp4");
		} else if (typeof MediaRecorder !== "undefined") {
			if (
				MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2") ||
				MediaRecorder.isTypeSupported("video/mp4")
			) {
				setExportFormat("mp4");
			}
		}
		// Load stored preset preference after mount
		const storedPreset = localStorage.getItem("arcumark:lastPreset");
		if (storedPreset) {
			setSelectedPresetId(storedPreset);
		}
		// Check browser capabilities after mount
		const webCodecs = typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
		setWebCodecsSupported(webCodecs);
		const generator = (window as Window & { MediaStreamTrackGenerator?: unknown })
			.MediaStreamTrackGenerator;
		const streamGen = typeof generator === "function" && typeof VideoFrame !== "undefined";
		setStreamGeneratorSupported(streamGen);
		setFastExportSupported(webCodecs || streamGen);
		// Check MP4 support
		if (typeof VideoEncoder !== "undefined") {
			setMp4Supported(true);
		} else if (typeof MediaRecorder !== "undefined") {
			setMp4Supported(
				MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2") ||
					MediaRecorder.isTypeSupported("video/mp4")
			);
		}
	}, []);

	useEffect(() => {
		if (!isExporting) {
			setPreviewFlipY(false);
		}
	}, [isExporting]);

	useEffect(() => {
		if (!projectId) {
			setProjectExists(null);
			return;
		}
		// Only check localStorage on the client after mount to avoid SSR/CSR mismatches
		setProjectExists(projectExistsInLocalStorage(projectId));
	}, [projectId]);

	const missingSources = useMemo(() => {
		if (!timeline) return [];
		const usedIds = new Set<string>();
		timeline.tracks.forEach((track) => track.clips.forEach((clip) => usedIds.add(clip.sourceId)));
		return Array.from(usedIds).filter((id) => !mediaRecords.some((m) => m.id === id));
	}, [timeline, mediaRecords]);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const abortRef = useRef<(() => void) | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const lastProgressUpdateRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		const urls: string[] = [];
		readAllMediaRecords()
			.then((records) => {
				if (cancelled) return;
				const mapped: LoadedMediaRecord[] = records.map((rec) => {
					const url = URL.createObjectURL(rec.blob);
					urls.push(url);
					return { ...rec, url };
				});
				setMediaRecords(mapped);
			})
			.catch((e) => console.error("Failed to load media library", e));
		return () => {
			cancelled = true;
			urls.forEach((url) => URL.revokeObjectURL(url));
		};
	}, []);

	useEffect(
		() => () => {
			if (downloadUrl) URL.revokeObjectURL(downloadUrl);
		},
		[downloadUrl]
	);

	const activePreset = useMemo(
		() => presets.find((p) => p.id === selectedPresetId) ?? presets[0] ?? null,
		[presets, selectedPresetId]
	);
	const [webCodecsSupported, setWebCodecsSupported] = useState(false);
	const [streamGeneratorSupported, setStreamGeneratorSupported] = useState(false);
	const [fastExportSupported, setFastExportSupported] = useState(false);
	const [mp4Supported, setMp4Supported] = useState(false);

	const prepareSources = async () => {
		const prepared = new Map<string, PreparedSource>();
		await Promise.all(
			mediaRecords.map(
				(rec) =>
					new Promise<void>((resolve) => {
						if (rec.type === "video") {
							const video = document.createElement("video");
							video.src = rec.url;
							video.crossOrigin = "anonymous";
							video.playsInline = true;
							video.preload = "auto";
							video.muted = true;
							video.onloadeddata = () => resolve();
							video.onerror = () => resolve();
							video.load();
							prepared.set(rec.id, { type: "video", element: video });
						} else if (rec.type === "image") {
							const img = new Image();
							img.src = rec.url;
							img.onload = () => resolve();
							img.onerror = () => resolve();
							prepared.set(rec.id, { type: "image", element: img });
						} else {
							resolve();
						}
					})
			)
		);
		return prepared;
	};

	const selectMimeType = (preferredFormat: "webm" | "mp4") => {
		if (typeof MediaRecorder === "undefined") return null;
		const mp4Types = [
			"video/mp4;codecs=avc1.42E01E,mp4a.40.2",
			"video/mp4;codecs=avc1.42E01E",
			"video/mp4",
		];
		const webmTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
		const mp4Type = mp4Types.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
		const webmType = webmTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;

		if (preferredFormat === "mp4") {
			if (mp4Type) return { mimeType: mp4Type, extension: "mp4" as const, usedFallback: false };
			if (webmType) return { mimeType: webmType, extension: "webm" as const, usedFallback: true };
			return null;
		}

		if (webmType) return { mimeType: webmType, extension: "webm" as const, usedFallback: false };
		if (mp4Type) return { mimeType: mp4Type, extension: "mp4" as const, usedFallback: true };
		return null;
	};

	const pickWebCodecsVideoConfig = async (
		format: "mp4" | "webm",
		width: number,
		height: number,
		fps: number
	) => {
		if (typeof VideoEncoder === "undefined") return null;
		if (format === "mp4" && (width % 2 !== 0 || height % 2 !== 0)) return null;

		const bitrate = Math.max(500_000, Math.round(width * height * fps * 0.07));
		const baseConfig: Omit<VideoEncoderConfig, "codec"> = {
			width,
			height,
			framerate: fps,
		};

		type VideoCodecCandidate =
			| { codec: string; muxerCodec: "avc" }
			| { codec: string; muxerCodec: "V_VP9" | "V_VP8" | "V_AV1" };

		const candidates: VideoCodecCandidate[] =
			format === "mp4"
				? [
						{ codec: "avc1.42001f", muxerCodec: "avc" as const },
						{ codec: "avc1.42E01E", muxerCodec: "avc" as const },
						{ codec: "avc1.4d401e", muxerCodec: "avc" as const },
					]
				: [
						{ codec: "av01.0.08M.08", muxerCodec: "V_AV1" as const },
						{ codec: "vp09.00.10.08", muxerCodec: "V_VP9" as const },
						{ codec: "vp09.00.51.08", muxerCodec: "V_VP9" as const },
						{ codec: "vp8", muxerCodec: "V_VP8" as const },
					];

		const variantConfigs: Partial<VideoEncoderConfig>[] = [
			{},
			{ bitrate },
			{ bitrate, bitrateMode: "variable" },
			{ bitrate, hardwareAcceleration: "prefer-hardware" },
			{ bitrate, bitrateMode: "variable", hardwareAcceleration: "prefer-hardware" },
		];

		for (const candidate of candidates) {
			const avcExtras =
				candidate.muxerCodec === "avc"
					? [{ avc: { format: "annexb" as const } }, { avc: { format: "avc" as const } }]
					: [{}];

			for (const variant of variantConfigs) {
				for (const extra of avcExtras) {
					const config: VideoEncoderConfig = {
						...baseConfig,
						codec: candidate.codec,
						...variant,
						...extra,
					};
					try {
						const support = await VideoEncoder.isConfigSupported(config);
						if (support.supported) {
							return { config, muxerCodec: candidate.muxerCodec };
						}
					} catch {
						// Ignore unsupported configs
					}
				}
			}
		}
		return null;
	};

	const pickWebCodecsAudioConfig = async (
		format: "mp4" | "webm",
		sampleRate: number,
		numberOfChannels: number
	) => {
		if (typeof AudioEncoder === "undefined") return null;
		const bitrate = format === "mp4" ? 128_000 : 96_000;
		const candidates =
			format === "mp4"
				? [{ codec: "mp4a.40.2", muxerCodec: "aac" as const }]
				: [{ codec: "opus", muxerCodec: "opus" as const }];

		for (const candidate of candidates) {
			const config: AudioEncoderConfig = {
				codec: candidate.codec,
				sampleRate,
				numberOfChannels,
				bitrate,
			};
			try {
				const support = await AudioEncoder.isConfigSupported(config);
				if (support.supported) {
					return { config, muxerCodec: candidate.muxerCodec };
				}
			} catch {
				// Ignore unsupported configs
			}
		}
		return null;
	};

	const sendTimeline = async (endpoint: string) => {
		if (!timeline) {
			setValidationResult("No timeline found in localStorage");
			return null;
		}
		setLoading(true);
		setMessage(null);
		setAdviceResult(null);
		setValidationResult(null);
		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(timeline),
			});
			const data = (await res.json()) as { ok?: boolean; errors?: string[]; advices?: string[] };
			setLoading(false);
			return { status: res.status, data };
		} catch {
			setLoading(false);
			setValidationResult("Request failed");
			return null;
		}
	};

	const handleValidate = async () => {
		const result = await sendTimeline("/api/timeline/validate");
		if (!result) return;
		if (result.status === 200 && result.data.ok) {
			setValidationResult("OK");
		} else {
			setValidationResult(
				Array.isArray(result.data.errors) ? result.data.errors.join("; ") : "Validation failed"
			);
		}
	};

	const handleAdvice = async () => {
		const result = await sendTimeline("/api/timeline/advice");
		if (!result) return;
		if (result.status === 200 && result.data.ok) {
			setAdviceResult(result.data.advices ?? []);
		} else {
			setValidationResult(
				Array.isArray(result.data.errors) ? result.data.errors.join("; ") : "Advice failed"
			);
		}
	};

	const handleStartExport = async () => {
		if (!timeline) {
			setExportError("Timeline not found. Save it in the editor first.");
			return;
		}
		if (!activePreset) {
			setExportError("Select an export preset.");
			return;
		}
		const actualDuration = calculateActualDuration(timeline);
		if (actualDuration <= 0) {
			setExportError("Timeline duration is 0 seconds.");
			return;
		}
		if (missingSources.length > 0) {
			setExportError(`Missing media: ${missingSources.join(", ")}`);
			return;
		}
		if (!fastExportSupported) {
			setExportError("Export is not supported in this browser.");
			return;
		}
		if (!webCodecsSupported && typeof MediaRecorder === "undefined") {
			setExportError("Export is not supported in this browser.");
			return;
		}

		setExportError(null);
		setMessage("Preparing sources…");
		setDownloadUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});
		setProgress(0);
		lastProgressUpdateRef.current = 0;

		setIsExporting(true);
		const waitForFrame = () =>
			new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		await waitForFrame();
		const previewCanvas = canvasRef.current;
		if (!previewCanvas) {
			setIsExporting(false);
			setExportError("Failed to initialize canvas.");
			return;
		}

		const preparedSources = await prepareSources();
		setMessage("Preparing render pipeline…");
		const fps = activePreset.fps || 30;
		previewCanvas.width = activePreset.width;
		previewCanvas.height = activePreset.height;

		const renderCanvas = document.createElement("canvas");
		renderCanvas.width = activePreset.width;
		renderCanvas.height = activePreset.height;

		const webglCanvas = document.createElement("canvas");
		webglCanvas.width = activePreset.width;
		webglCanvas.height = activePreset.height;
		const previewWebgl = WebGLCompositor.create(previewCanvas);
		const offscreenWebgl = previewWebgl ? null : WebGLCompositor.create(webglCanvas);
		const webglRenderer = previewWebgl ?? offscreenWebgl;
		let canvas = previewWebgl ? previewCanvas : webglRenderer ? webglCanvas : renderCanvas;
		setPreviewFlipY(Boolean(webglRenderer));
		let previewCtx: CanvasRenderingContext2D | null = null;
		if (!webglRenderer || canvas !== previewCanvas) {
			previewCtx =
				previewCanvas.getContext("2d", { willReadFrequently: true }) ??
				previewCanvas.getContext("2d");
		}
		let ctx: CanvasRenderingContext2D | null = null;
		if (webglRenderer) {
			webglRenderer.setSize(canvas.width, canvas.height);
		} else {
			ctx =
				renderCanvas.getContext("2d", { willReadFrequently: true }) ??
				renderCanvas.getContext("2d");
			if (!ctx) {
				const fallbackCtx =
					previewCanvas.getContext("2d", { willReadFrequently: true }) ??
					previewCanvas.getContext("2d");
				if (!fallbackCtx) {
					setIsExporting(false);
					setExportError("Failed to initialize canvas.");
					return;
				}
				canvas = previewCanvas;
				ctx = fallbackCtx;
				previewCtx = fallbackCtx;
			}
			setMessage("WebGL unavailable; using 2D renderer.");
		}
		const encodeCanvas = webglRenderer ? document.createElement("canvas") : null;
		const encodeCtx = encodeCanvas ? encodeCanvas.getContext("2d") : null;
		if (encodeCanvas) {
			encodeCanvas.width = canvas.width;
			encodeCanvas.height = canvas.height;
		}
		const getEncodeSource = () => {
			if (!encodeCanvas || !encodeCtx || !webglRenderer) return canvas;
			encodeCtx.setTransform(1, 0, 0, -1, 0, encodeCanvas.height);
			encodeCtx.drawImage(canvas, 0, 0, encodeCanvas.width, encodeCanvas.height);
			encodeCtx.setTransform(1, 0, 0, 1, 0, 0);
			return encodeCanvas;
		};
		const textCanvas = webglRenderer ? document.createElement("canvas") : null;
		const textCtx = textCanvas ? textCanvas.getContext("2d") : null;
		if (textCanvas) {
			textCanvas.width = canvas.width;
			textCanvas.height = canvas.height;
		}
		const debugState = {
			init: false,
			audioInit: false,
			firstFrame: false,
			noClip: false,
			present: false,
			pixelLogged: false,
			drawPathLogged: false,
		};
		let lastYieldTime = performance.now();
		const yieldToBrowser = async () => {
			await waitForFrame();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		};
		const maybeYield = async () => {
			const now = performance.now();
			if (now - lastYieldTime >= 100) {
				lastYieldTime = now;
				await yieldToBrowser();
			}
		};
		let lastPreviewUpdate = 0;
		const presentFrame = () => {
			if (!previewCtx || canvas === previewCanvas) return;
			const now = performance.now();
			if (now - lastPreviewUpdate < 100) return;
			lastPreviewUpdate = now;
			webglRenderer?.flush();
			previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
			if (!debugState.present) {
				console.info("[export] preview frame presented");
				debugState.present = true;
			}
		};

		const mediaById = new Map(mediaRecords.map((record) => [record.id, record]));
		const videoTracks = timeline.tracks.filter((track) => track.kind === "video");
		const audioTracks = timeline.tracks.filter((track) => track.kind === "audio");
		const textTracks = timeline.tracks.filter((track) => track.kind === "text");
		if (!debugState.init) {
			console.info("[export] init", {
				preset: { width: activePreset.width, height: activePreset.height, fps },
				renderer: webglRenderer ? "webgl" : "2d",
				webglTarget: webglRenderer ? (canvas === previewCanvas ? "preview" : "offscreen") : "none",
				canvasIsPreview: canvas === previewCanvas,
				previewContext: previewCtx ? "2d" : "none",
				previewSize: {
					width: previewCanvas.width,
					height: previewCanvas.height,
					clientWidth: previewCanvas.clientWidth,
					clientHeight: previewCanvas.clientHeight,
				},
			});
			debugState.init = true;
		}
		const videoClips = videoTracks.flatMap((track) => track.clips);
		const audioTrackClips = audioTracks.flatMap((track) => track.clips);
		const videoAudioClips =
			audioTrackClips.length === 0
				? videoClips.filter((clip) => mediaById.get(clip.sourceId)?.type === "video")
				: [];
		const audioClips = [...audioTrackClips, ...videoAudioClips];
		if (!debugState.audioInit && videoAudioClips.length > 0) {
			console.info("[export] using video track audio (no audio clips found)");
			debugState.audioInit = true;
		}
		const videoDecoderMap = new Map<
			string,
			{ input: Input; sink: VideoSampleSink; durationSeconds: number | null }
		>();
		const releaseVideoDecoders = () => {
			for (const entry of videoDecoderMap.values()) {
				try {
					entry.input.dispose();
				} catch {
					/* ignore */
				}
			}
			videoDecoderMap.clear();
		};
		const prepareVideoDecoders = async () => {
			if (videoClips.length === 0) return;
			const uniqueSourceIds = new Set(videoClips.map((clip) => clip.sourceId));
			for (const sourceId of uniqueSourceIds) {
				const record = mediaById.get(sourceId);
				if (!record || record.type !== "video") continue;
				try {
					const input = new Input({
						formats: ALL_FORMATS,
						source: new BlobSource(record.blob),
					});
					const videoTrack = await input.getPrimaryVideoTrack();
					if (!videoTrack || !(await videoTrack.canDecode())) {
						input.dispose();
						continue;
					}
					const durationSeconds =
						Number.isFinite(record.durationSeconds) && record.durationSeconds > 0
							? record.durationSeconds
							: null;
					videoDecoderMap.set(sourceId, {
						input,
						sink: new VideoSampleSink(videoTrack),
						durationSeconds,
					});
				} catch (error) {
					console.warn("Failed to prepare video decoder:", error);
				}
			}
		};

		if (videoClips.length > 0) {
			setMessage("Preparing video decoders…");
		}
		await prepareVideoDecoders();
		const createVideoIteratorForClip = (clip: Clip, startFrameIndex: number) => {
			const entry = videoDecoderMap.get(clip.sourceId);
			if (!entry) return null;
			const startFrame = Math.max(startFrameIndex, Math.floor(clip.start * fps));
			const endFrame = Math.ceil(clip.end * fps);
			const durationLimit = entry.durationSeconds;
			const props = clip.props || {};
			const sourceStart = typeof props.sourceStart === "number" ? props.sourceStart : 0;
			const timestamps = (async function* () {
				for (let frameIndex = startFrame; frameIndex < endFrame; frameIndex++) {
					const time = frameIndex / fps;
					const clipOffset = time - clip.start;
					const sourceTime = calculateSourceTime(clipOffset, props, sourceStart);
					const clamped =
						durationLimit && Number.isFinite(durationLimit)
							? Math.min(Math.max(sourceTime, 0), durationLimit)
							: Math.max(sourceTime, 0);
					yield clamped;
				}
			})();
			return entry.sink.samplesAtTimestamps(timestamps);
		};
		const curvesLutCache = new Map<string, Uint8Array>();
		const getCurvesLut = (curves: {
			master: { x: number; y: number }[];
			red: { x: number; y: number }[];
			green: { x: number; y: number }[];
			blue: { x: number; y: number }[];
		}) => {
			const key = JSON.stringify(curves);
			const cached = curvesLutCache.get(key);
			if (cached) return cached;
			const lut = buildCurvesLutTexture(curves);
			curvesLutCache.set(key, lut);
			return lut;
		};

		if (webCodecsSupported) {
			let canceled = false;
			let videoEncoder: VideoEncoder | null = null;
			let audioEncoder: AudioEncoder | null = null;
			let videoEncoderError: Error | null = null;
			let audioEncoderError: Error | null = null;

			abortRef.current = () => {
				canceled = true;
				try {
					videoEncoder?.close();
				} catch {
					/* ignore */
				}
				try {
					audioEncoder?.close();
				} catch {
					/* ignore */
				}
				releaseVideoDecoders();
				setIsExporting(false);
				setMessage("Export canceled.");
			};

			let chosenFormat: "mp4" | "webm" = exportFormat;
			let videoSelection = await pickWebCodecsVideoConfig(
				chosenFormat,
				canvas.width,
				canvas.height,
				fps
			);
			if (!videoSelection) {
				const fallback = exportFormat === "mp4" ? "webm" : "mp4";
				videoSelection = await pickWebCodecsVideoConfig(fallback, canvas.width, canvas.height, fps);
				if (videoSelection) {
					chosenFormat = fallback;
					if (exportFormat === "mp4") {
						setMessage("MP4 not supported for this preset; exporting WebM instead.");
					}
				}
			}

			if (!videoSelection) {
				setIsExporting(false);
				abortRef.current = null;
				if (streamGeneratorSupported) {
					setMessage("WebCodecs codec unavailable; using stream export.");
				} else {
					setExportError("No supported WebCodecs video codec available.");
					releaseVideoDecoders();
					return;
				}
			} else {
				setIsExporting(true);
				setMessage("Encoding video…");
			}

			if (videoSelection) {
				setDownloadExtension(chosenFormat);
				const mimeType = chosenFormat === "mp4" ? "video/mp4" : "video/webm";
				const waitForVideoEncoder = async () => {
					const encoder = videoEncoder;
					if (!encoder) return;
					if (encoder.encodeQueueSize >= 4) {
						await new Promise<void>((resolve) => {
							encoder.addEventListener("dequeue", () => resolve(), { once: true });
						});
					}
				};

				const renderOfflineAudio = async (): Promise<AudioBuffer | null> => {
					if (audioClips.length === 0 || typeof OfflineAudioContext === "undefined") return null;

					const sampleRate =
						chosenFormat === "webm" ? 48000 : getAudioContext().sampleRate || 48000;
					const totalFrames = Math.ceil(actualDuration * sampleRate);
					const offlineContext = new OfflineAudioContext(2, totalFrames, sampleRate);
					const decodedCache = new Map<string, AudioBuffer>();

					const decodeAudio = async (record: LoadedMediaRecord) => {
						if (record.type === "image") return null;
						const cached = decodedCache.get(record.id);
						if (cached) return cached;
						try {
							const arrayBuffer = await record.blob.arrayBuffer();
							const buffer = await offlineContext.decodeAudioData(arrayBuffer);
							decodedCache.set(record.id, buffer);
							return buffer;
						} catch (error) {
							console.warn("[export] Failed to decode audio for", record.name || record.id, error);
							return null;
						}
					};

					let hasAudio = false;
					for (const clip of audioClips) {
						const record = mediaById.get(clip.sourceId);
						if (!record) continue;
						const buffer = await decodeAudio(record);
						if (!buffer) continue;
						const source = offlineContext.createBufferSource();
						source.buffer = buffer;

						const props = clip.props || {};
						const speed =
							typeof props.playbackSpeed === "number" ? Math.abs(props.playbackSpeed) : 1.0;
						source.playbackRate.value = speed;

						let current: AudioNode = source;

						const lowEq = offlineContext.createBiquadFilter();
						lowEq.type = "lowshelf";
						lowEq.frequency.value = 100;
						lowEq.gain.value = (props.eqLow as number) || 0;

						const midEq = offlineContext.createBiquadFilter();
						midEq.type = "peaking";
						midEq.frequency.value = 1000;
						midEq.Q.value = 1.0;
						midEq.gain.value = (props.eqMid as number) || 0;

						const highEq = offlineContext.createBiquadFilter();
						highEq.type = "highshelf";
						highEq.frequency.value = 10000;
						highEq.gain.value = (props.eqHigh as number) || 0;

						current.connect(lowEq);
						lowEq.connect(midEq);
						midEq.connect(highEq);
						current = highEq;

						if (props.compressorEnabled) {
							const compressor = offlineContext.createDynamicsCompressor();
							compressor.threshold.value = (props.compressorThreshold as number) || -24;
							compressor.ratio.value = (props.compressorRatio as number) || 12;
							compressor.knee.value = 30;
							compressor.attack.value = 0.003;
							compressor.release.value = 0.25;
							current.connect(compressor);
							current = compressor;
						}

						if (props.delayEnabled) {
							const delay = offlineContext.createDelay(2.0);
							delay.delayTime.value = (props.delayTime as number) || 0.5;
							const feedback = offlineContext.createGain();
							feedback.gain.value = (props.delayFeedback as number) || 0.4;
							current.connect(delay);
							delay.connect(feedback);
							feedback.connect(delay);
							current = delay;
						}

						let output: AudioNode = current;
						if (props.reverbEnabled) {
							const convolver = offlineContext.createConvolver();
							convolver.buffer = generateImpulseResponse(
								offlineContext,
								(props.reverbType as "small" | "medium" | "large" | "hall") || "medium"
							);
							const dryGain = offlineContext.createGain();
							const wetGain = offlineContext.createGain();
							const mix = (props.reverbMix as number) || 0.3;
							dryGain.gain.value = 1 - mix;
							wetGain.gain.value = mix;
							current.connect(dryGain);
							current.connect(convolver);
							convolver.connect(wetGain);
							const mixGain = offlineContext.createGain();
							dryGain.connect(mixGain);
							wetGain.connect(mixGain);
							output = mixGain;
						}

						const gain = offlineContext.createGain();
						output.connect(gain);
						gain.connect(offlineContext.destination);

						const baseVolume =
							typeof props.volume === "number" ? Math.min(1, Math.max(0, props.volume / 100)) : 1;
						let finalVolume = baseVolume;

						if (props.normalizeEnabled) {
							const peakLevel = (props.peakLevelDb as number) || 0;
							const targetLevel = (props.normalizeTarget as number) || -1;
							finalVolume *= calculateNormalizeGain(peakLevel, targetLevel);
						}

						const clipDuration = clip.end - clip.start;
						const fadeIn = Math.min((props.fadeIn as number) || 0, clipDuration);
						const fadeOut = Math.min((props.fadeOut as number) || 0, clipDuration);
						const gainParam = gain.gain;
						const clipStart = clip.start;
						const clipEnd = clip.end;

						gainParam.setValueAtTime(0, clipStart);
						if (fadeIn > 0) {
							gainParam.linearRampToValueAtTime(finalVolume, clipStart + fadeIn);
						} else {
							gainParam.setValueAtTime(finalVolume, clipStart);
						}

						if (fadeOut > 0) {
							const fadeOutStart = Math.max(clipEnd - fadeOut, clipStart);
							gainParam.setValueAtTime(finalVolume, fadeOutStart);
							gainParam.linearRampToValueAtTime(0, clipEnd);
						} else {
							gainParam.setValueAtTime(finalVolume, clipEnd);
						}

						const sourceStart = typeof props.sourceStart === "number" ? props.sourceStart : 0;
						const sourceDuration = Math.max(0, clipDuration * speed);
						const safeSourceStart = Math.max(0, Math.min(sourceStart, buffer.duration));
						const remaining = Math.max(0, buffer.duration - safeSourceStart);
						const duration = Math.min(sourceDuration, remaining);

						if (duration > 0) {
							source.start(clipStart, safeSourceStart, duration);
							hasAudio = true;
						}
					}

					if (!hasAudio) return null;
					return offlineContext.startRendering();
				};

				const seekVideoFrame = async (videoEl: HTMLVideoElement, timeSec: number) => {
					const maxTime = Number.isFinite(videoEl.duration) ? videoEl.duration : timeSec;
					const targetTime = Math.max(0, Math.min(timeSec, maxTime));
					if (Math.abs(videoEl.currentTime - targetTime) < 0.001 && videoEl.readyState >= 2) return;
					await new Promise<void>((resolve) => {
						const handleSeeked = () => resolve();
						const handleError = () => resolve();
						videoEl.addEventListener("seeked", handleSeeked, { once: true });
						videoEl.addEventListener("error", handleError, { once: true });
						try {
							videoEl.currentTime = targetTime;
						} catch {
							resolve();
						}
					});
				};

				let currentVideoClipId: string | null = null;
				let currentVideoIterator: AsyncGenerator<VideoSample | null, void, unknown> | null = null;

				const renderVisualFrame = async (timeSec: number, frameIndex: number) => {
					if (!debugState.firstFrame) {
						const initialClip = findActiveClipInTracks(videoTracks, timeSec);
						const initialText = findActiveTextClipsInTracks(textTracks, timeSec);
						console.info("[export] first frame", {
							timeSec,
							frameIndex,
							hasVideoClip: Boolean(initialClip),
							hasTextClip: initialText.length > 0,
							sourcePrepared: initialClip ? preparedSources.has(initialClip.sourceId) : false,
						});
						debugState.firstFrame = true;
						if (!initialClip) {
							debugState.noClip = true;
						}
					}
					if (!webglRenderer) {
						if (!ctx) return;
						ctx.fillStyle = "#000000";
						ctx.fillRect(0, 0, canvas.width, canvas.height);

						const videoClip = findActiveClipInTracks(videoTracks, timeSec);
						if (!videoClip && currentVideoIterator) {
							await currentVideoIterator.return?.();
							currentVideoIterator = null;
							currentVideoClipId = null;
						}
						if (videoClip && preparedSources.has(videoClip.sourceId)) {
							const source = preparedSources.get(videoClip.sourceId)!;
							if (source.type === "video") {
								let sample: VideoSample | null = null;
								if (videoClip.id !== currentVideoClipId) {
									if (currentVideoIterator) {
										await currentVideoIterator.return?.();
									}
									currentVideoClipId = videoClip.id;
									currentVideoIterator = createVideoIteratorForClip(videoClip, frameIndex);
								}
								if (currentVideoIterator) {
									const nextSample = await currentVideoIterator.next();
									sample = nextSample.done ? null : (nextSample.value ?? null);
								}
								if (sample) {
									if (!debugState.drawPathLogged) {
										console.info("[export] draw path", {
											type: "video-sample",
											displayWidth: sample.displayWidth,
											displayHeight: sample.displayHeight,
										});
										debugState.drawPathLogged = true;
									}
									drawSampleToCanvas(ctx, canvas, videoClip, sample, timeSec);
									sample.close();
								} else {
									const videoEl = source.element;
									videoEl.pause();
									const offset = Math.max(0, timeSec - videoClip.start);
									const sourceStart =
										typeof videoClip.props?.sourceStart === "number"
											? videoClip.props.sourceStart
											: 0;
									const videoTime = calculateSourceTime(offset, videoClip.props || {}, sourceStart);
									await seekVideoFrame(videoEl, videoTime);
									if (!debugState.drawPathLogged) {
										console.info("[export] draw path", {
											type: "video-element",
											videoWidth: videoEl.videoWidth,
											videoHeight: videoEl.videoHeight,
											readyState: videoEl.readyState,
										});
										debugState.drawPathLogged = true;
									}
									drawClipToCanvas(ctx, canvas, videoClip, videoEl, timeSec);
								}
							} else if (source.type === "image") {
								if (!debugState.drawPathLogged) {
									console.info("[export] draw path", {
										type: "image",
										naturalWidth: source.element.naturalWidth,
										naturalHeight: source.element.naturalHeight,
									});
									debugState.drawPathLogged = true;
								}
								drawClipToCanvas(ctx, canvas, videoClip, source.element, timeSec);
							}
						}

						const textClips = findActiveTextClipsInTracks(textTracks, timeSec);
						textClips.forEach((tc) => drawTextClip(ctx, canvas, tc, timeSec));
						if (!debugState.pixelLogged) {
							const pixel = ctx.getImageData(0, 0, 1, 1).data;
							console.info("[export] first pixel", {
								r: pixel[0],
								g: pixel[1],
								b: pixel[2],
								a: pixel[3],
							});
							debugState.pixelLogged = true;
						}
						presentFrame();
						return;
					}

					webglRenderer.beginFrame();

					const videoClip = findActiveClipInTracks(videoTracks, timeSec);
					if (!videoClip && currentVideoIterator) {
						await currentVideoIterator.return?.();
						currentVideoIterator = null;
						currentVideoClipId = null;
					}

					const drawWebglClip = (
						clip: Clip,
						sourceId: string,
						source: TexImageSource | VideoFrame,
						mediaWidth: number,
						mediaHeight: number
					) => {
						const params = computeClipRenderParams(
							clip,
							timeSec,
							canvas.width,
							canvas.height,
							mediaWidth,
							mediaHeight
						);
						const positions = buildClipPositions(params, canvas.width, canvas.height);
						const uvs = buildClipUVs(params, mediaWidth, mediaHeight);
						const curves = params.colorCorrection.curves as
							| {
									master: { x: number; y: number }[];
									red: { x: number; y: number }[];
									green: { x: number; y: number }[];
									blue: { x: number; y: number }[];
							  }
							| undefined;
						const curvesLut = curves ? getCurvesLut(curves) : null;
						const effects: WebGLClipEffects = {
							opacity: params.opacity,
							brightness: params.brightness,
							contrast: params.contrast,
							saturation: params.saturation,
							blur: params.blur,
							levels: params.colorCorrection.levels,
							whiteBalance: params.colorCorrection.whiteBalance,
							colorWheel: params.colorCorrection.colorWheel,
							curvesLut,
							chromaKey: params.chromaKey,
							wipeRect: params.wipeRect,
						};
						webglRenderer.drawClip(
							sourceId,
							source,
							mediaWidth,
							mediaHeight,
							positions,
							uvs,
							effects
						);
					};

					if (videoClip && preparedSources.has(videoClip.sourceId)) {
						const source = preparedSources.get(videoClip.sourceId)!;
						if (source.type === "video") {
							let sample: VideoSample | null = null;
							if (videoClip.id !== currentVideoClipId) {
								if (currentVideoIterator) {
									await currentVideoIterator.return?.();
								}
								currentVideoClipId = videoClip.id;
								currentVideoIterator = createVideoIteratorForClip(videoClip, frameIndex);
							}
							if (currentVideoIterator) {
								const nextSample = await currentVideoIterator.next();
								sample = nextSample.done ? null : (nextSample.value ?? null);
							}
							if (sample) {
								const displayWidth = sample.displayWidth || sample.codedWidth || canvas.width;
								const displayHeight = sample.displayHeight || sample.codedHeight || canvas.height;
								const source = sample.toCanvasImageSource();
								drawWebglClip(videoClip, videoClip.sourceId, source, displayWidth, displayHeight);
								sample.close();
							} else {
								const videoEl = source.element;
								videoEl.pause();
								const offset = Math.max(0, timeSec - videoClip.start);
								const sourceStart =
									typeof videoClip.props?.sourceStart === "number"
										? videoClip.props.sourceStart
										: 0;
								const videoTime = calculateSourceTime(offset, videoClip.props || {}, sourceStart);
								await seekVideoFrame(videoEl, videoTime);
								drawWebglClip(
									videoClip,
									videoClip.sourceId,
									videoEl,
									videoEl.videoWidth,
									videoEl.videoHeight
								);
							}
						} else if (source.type === "image") {
							drawWebglClip(
								videoClip,
								videoClip.sourceId,
								source.element,
								source.element.naturalWidth || canvas.width,
								source.element.naturalHeight || canvas.height
							);
						}
					}

					if (textCanvas && textCtx) {
						textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
						const textClips = findActiveTextClipsInTracks(textTracks, timeSec);
						textClips.forEach((tc) => drawTextClip(textCtx, textCanvas, tc, timeSec));
						if (textClips.length > 0) {
							const textParams: ClipRenderParams = {
								sx: 0,
								sy: 0,
								sw: textCanvas.width,
								sh: textCanvas.height,
								dx: 0,
								dy: 0,
								dw: canvas.width,
								dh: canvas.height,
								opacity: 1,
								brightness: 1,
								contrast: 1,
								saturation: 1,
								blur: 0,
								wipeRect: null,
								colorCorrection: {},
							};
							const positions = buildClipPositions(textParams, canvas.width, canvas.height);
							const uvs = buildClipUVs(textParams, textCanvas.width, textCanvas.height);
							const effects: WebGLClipEffects = {
								opacity: 1,
								brightness: 1,
								contrast: 1,
								saturation: 1,
								blur: 0,
							};
							webglRenderer.drawClip(
								"__text__",
								textCanvas,
								textCanvas.width,
								textCanvas.height,
								positions,
								uvs,
								effects
							);
						}
					}
					presentFrame();
				};

				let audioBuffer: AudioBuffer | null = null;
				let audioSelection: { config: AudioEncoderConfig; muxerCodec: "aac" | "opus" } | null =
					null;

				if (audioClips.length > 0 && typeof AudioEncoder !== "undefined") {
					setMessage("Rendering audio…");
					try {
						audioBuffer = await renderOfflineAudio();
						if (audioBuffer) {
							audioSelection = await pickWebCodecsAudioConfig(
								chosenFormat,
								audioBuffer.sampleRate,
								audioBuffer.numberOfChannels
							);
							if (!audioSelection) {
								setMessage("Audio encoder unsupported; exporting muted.");
								audioBuffer = null;
							}
						}
					} catch (error) {
						console.error("Failed to render offline audio:", error);
						setMessage("Audio render failed; exporting muted.");
						audioBuffer = null;
					}
				} else if (audioClips.length > 0) {
					setMessage("Audio encoder unsupported; exporting muted.");
				}

				const webmVideoCodec =
					videoSelection.muxerCodec === "V_VP8"
						? "V_VP8"
						: videoSelection.muxerCodec === "V_AV1"
							? "V_AV1"
							: ("V_VP9" as const);
				const webmAudioCodec = "A_OPUS" as const;
				let muxer: Mp4Muxer<Mp4ArrayBufferTarget> | WebMMuxer<WebMArrayBufferTarget>;
				let getMuxedBuffer: () => ArrayBuffer;

				if (chosenFormat === "mp4") {
					const target = new Mp4ArrayBufferTarget();
					muxer = new Mp4Muxer({
						target,
						video: {
							codec: "avc",
							width: canvas.width,
							height: canvas.height,
							frameRate: fps,
						},
						audio:
							audioSelection && audioBuffer
								? {
										codec: audioSelection.muxerCodec,
										numberOfChannels: audioBuffer.numberOfChannels,
										sampleRate: audioBuffer.sampleRate,
									}
								: undefined,
						fastStart: "in-memory",
						firstTimestampBehavior: "offset",
					});
					getMuxedBuffer = () => target.buffer;
				} else {
					const target = new WebMArrayBufferTarget();
					muxer = new WebMMuxer({
						target,
						video: {
							codec: webmVideoCodec,
							width: canvas.width,
							height: canvas.height,
							frameRate: fps,
						},
						audio:
							audioSelection && audioBuffer
								? {
										codec: webmAudioCodec,
										numberOfChannels: audioBuffer.numberOfChannels,
										sampleRate: audioBuffer.sampleRate,
									}
								: undefined,
						firstTimestampBehavior: "offset",
					});
					getMuxedBuffer = () => target.buffer;
				}

				videoEncoder = new VideoEncoder({
					output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
					error: (error) => {
						videoEncoderError = error instanceof Error ? error : new Error(String(error));
					},
				});
				videoEncoder.configure(videoSelection.config);

				if (audioSelection && audioBuffer) {
					audioEncoder = new AudioEncoder({
						output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
						error: (error) => {
							audioEncoderError = error instanceof Error ? error : new Error(String(error));
						},
					});
					audioEncoder.configure(audioSelection.config);
				}

				const totalFrames = Math.max(1, Math.ceil(actualDuration * fps));
				const frameDurationUs = Math.round(1_000_000 / fps);
				const keyFrameInterval = Math.max(1, Math.round(fps));
				const yieldInterval = Math.max(1, Math.round(fps));

				try {
					for (let frameIndex = 0; frameIndex < totalFrames && !canceled; frameIndex++) {
						const timeSec = Math.min(frameIndex / fps, actualDuration);
						await renderVisualFrame(timeSec, frameIndex);
						const frameSource = getEncodeSource();
						const frame = new VideoFrame(frameSource, {
							timestamp: Math.round(timeSec * 1_000_000),
							duration: frameDurationUs,
						});
						videoEncoder.encode(frame, { keyFrame: frameIndex % keyFrameInterval === 0 });
						frame.close();

						await waitForVideoEncoder();
						if (videoEncoderError) throw videoEncoderError;

						const progressValue = timeSec / actualDuration;
						const now = performance.now();
						if (
							now - lastProgressUpdateRef.current >= 150 ||
							progressValue >= 1 ||
							frameIndex === 0
						) {
							setProgress(progressValue);
							setMessage(`Encoding video… ${frameIndex + 1}/${totalFrames} frames`);
							lastProgressUpdateRef.current = now;
						}
						if (frameIndex % yieldInterval === 0) {
							await yieldToBrowser();
						}
						await maybeYield();
					}

					await videoEncoder.flush();
					videoEncoder.close();
					setMessage("Finalizing video…");

					if (audioEncoder && audioBuffer) {
						setMessage("Encoding audio…");
						const channels = audioBuffer.numberOfChannels;
						const totalAudioFrames = audioBuffer.length;
						const chunkSize = 1024;
						for (let offset = 0; offset < totalAudioFrames && !canceled; offset += chunkSize) {
							const frameLength = Math.min(chunkSize, totalAudioFrames - offset);
							const interleaved = new Float32Array(frameLength * channels);
							for (let ch = 0; ch < channels; ch++) {
								const channelData = audioBuffer.getChannelData(ch);
								for (let i = 0; i < frameLength; i++) {
									interleaved[i * channels + ch] = channelData[offset + i] ?? 0;
								}
							}
							const audioData = new AudioData({
								format: "f32",
								sampleRate: audioBuffer.sampleRate,
								numberOfChannels: channels,
								numberOfFrames: frameLength,
								timestamp: Math.round((offset / audioBuffer.sampleRate) * 1_000_000),
								data: interleaved,
							});
							audioEncoder.encode(audioData);
							audioData.close();

							if (audioEncoderError) throw audioEncoderError;
						}
						await audioEncoder.flush();
						audioEncoder.close();
					}

					if (canceled) {
						setIsExporting(false);
						abortRef.current = null;
						releaseVideoDecoders();
						return;
					}

					setMessage("Muxing container…");
					muxer.finalize();
					const blob = new Blob([getMuxedBuffer()], { type: mimeType });
					const url = URL.createObjectURL(blob);
					setDownloadUrl(url);
					setMessage("Export complete. Download is ready.");
					setProgress(1);
				} catch (error) {
					console.error("Export failed:", error);
					setExportError("Export failed.");
				} finally {
					setIsExporting(false);
					abortRef.current = null;
					releaseVideoDecoders();
				}

				return;
			}
		}

		const selectedFormat = selectMimeType(exportFormat);
		if (!selectedFormat) {
			setExportError("No supported MediaRecorder format available.");
			releaseVideoDecoders();
			return;
		}
		if (exportFormat === "mp4" && selectedFormat.extension === "webm") {
			setMessage("MP4 not supported in this browser; exporting WebM instead.");
		}
		setDownloadExtension(selectedFormat.extension);
		const mimeType = selectedFormat.mimeType;

		const generator = (
			window as Window & { MediaStreamTrackGenerator?: MediaStreamTrackGeneratorCtor }
		).MediaStreamTrackGenerator;
		if (!generator) {
			setExportError("Export is not supported in this browser.");
			releaseVideoDecoders();
			return;
		}

		setIsExporting(true);

		const createVideoTrack = () =>
			new generator({ kind: "video" }) as MediaStreamTrack & {
				writable: WritableStream<VideoFrame>;
			};
		const createAudioTrack = () =>
			new generator({ kind: "audio" }) as MediaStreamTrack & {
				writable: WritableStream<AudioData>;
			};

		const videoTrack = createVideoTrack();
		const videoWriter: WritableStreamDefaultWriter<VideoFrame> = videoTrack.writable.getWriter();
		let audioWriter: WritableStreamDefaultWriter<AudioData> | null = null;
		let audioTrack: (MediaStreamTrack & { writable: WritableStream<AudioData> }) | null = null;

		const renderOfflineAudio = async (format: "mp4" | "webm"): Promise<AudioBuffer | null> => {
			if (audioClips.length === 0 || typeof OfflineAudioContext === "undefined") return null;

			const sampleRate = format === "webm" ? 48000 : getAudioContext().sampleRate || 48000;
			const totalFrames = Math.ceil(actualDuration * sampleRate);
			const offlineContext = new OfflineAudioContext(2, totalFrames, sampleRate);
			const decodedCache = new Map<string, AudioBuffer>();

			const decodeAudio = async (record: LoadedMediaRecord) => {
				if (record.type === "image") return null;
				const cached = decodedCache.get(record.id);
				if (cached) return cached;
				try {
					const arrayBuffer = await record.blob.arrayBuffer();
					const buffer = await offlineContext.decodeAudioData(arrayBuffer);
					decodedCache.set(record.id, buffer);
					return buffer;
				} catch (error) {
					console.warn("[export] Failed to decode audio for", record.name || record.id, error);
					return null;
				}
			};

			let hasAudio = false;
			for (const clip of audioClips) {
				const record = mediaById.get(clip.sourceId);
				if (!record) continue;
				const buffer = await decodeAudio(record);
				if (!buffer) continue;
				const source = offlineContext.createBufferSource();
				source.buffer = buffer;

				const props = clip.props || {};
				const speed = typeof props.playbackSpeed === "number" ? Math.abs(props.playbackSpeed) : 1.0;
				source.playbackRate.value = speed;

				let current: AudioNode = source;

				const lowEq = offlineContext.createBiquadFilter();
				lowEq.type = "lowshelf";
				lowEq.frequency.value = 100;
				lowEq.gain.value = (props.eqLow as number) || 0;

				const midEq = offlineContext.createBiquadFilter();
				midEq.type = "peaking";
				midEq.frequency.value = 1000;
				midEq.Q.value = 1.0;
				midEq.gain.value = (props.eqMid as number) || 0;

				const highEq = offlineContext.createBiquadFilter();
				highEq.type = "highshelf";
				highEq.frequency.value = 10000;
				highEq.gain.value = (props.eqHigh as number) || 0;

				current.connect(lowEq);
				lowEq.connect(midEq);
				midEq.connect(highEq);
				current = highEq;

				if (props.compressorEnabled) {
					const compressor = offlineContext.createDynamicsCompressor();
					compressor.threshold.value = (props.compressorThreshold as number) || -24;
					compressor.ratio.value = (props.compressorRatio as number) || 12;
					compressor.knee.value = 30;
					compressor.attack.value = 0.003;
					compressor.release.value = 0.25;
					current.connect(compressor);
					current = compressor;
				}

				if (props.delayEnabled) {
					const delay = offlineContext.createDelay(2.0);
					delay.delayTime.value = (props.delayTime as number) || 0.5;
					const feedback = offlineContext.createGain();
					feedback.gain.value = (props.delayFeedback as number) || 0.4;
					current.connect(delay);
					delay.connect(feedback);
					feedback.connect(delay);
					current = delay;
				}

				let output: AudioNode = current;
				if (props.reverbEnabled) {
					const convolver = offlineContext.createConvolver();
					convolver.buffer = generateImpulseResponse(
						offlineContext,
						(props.reverbType as "small" | "medium" | "large" | "hall") || "medium"
					);
					const dryGain = offlineContext.createGain();
					const wetGain = offlineContext.createGain();
					const mix = (props.reverbMix as number) || 0.3;
					dryGain.gain.value = 1 - mix;
					wetGain.gain.value = mix;
					current.connect(dryGain);
					current.connect(convolver);
					convolver.connect(wetGain);
					const mixGain = offlineContext.createGain();
					dryGain.connect(mixGain);
					wetGain.connect(mixGain);
					output = mixGain;
				}

				const gain = offlineContext.createGain();
				output.connect(gain);
				gain.connect(offlineContext.destination);

				const baseVolume =
					typeof props.volume === "number" ? Math.min(1, Math.max(0, props.volume / 100)) : 1;
				let finalVolume = baseVolume;

				if (props.normalizeEnabled) {
					const peakLevel = (props.peakLevelDb as number) || 0;
					const targetLevel = (props.normalizeTarget as number) || -1;
					finalVolume *= calculateNormalizeGain(peakLevel, targetLevel);
				}

				const clipDuration = clip.end - clip.start;
				const fadeIn = Math.min((props.fadeIn as number) || 0, clipDuration);
				const fadeOut = Math.min((props.fadeOut as number) || 0, clipDuration);
				const gainParam = gain.gain;
				const clipStart = clip.start;
				const clipEnd = clip.end;

				gainParam.setValueAtTime(0, clipStart);
				if (fadeIn > 0) {
					gainParam.linearRampToValueAtTime(finalVolume, clipStart + fadeIn);
				} else {
					gainParam.setValueAtTime(finalVolume, clipStart);
				}

				if (fadeOut > 0) {
					const fadeOutStart = Math.max(clipEnd - fadeOut, clipStart);
					gainParam.setValueAtTime(finalVolume, fadeOutStart);
					gainParam.linearRampToValueAtTime(0, clipEnd);
				} else {
					gainParam.setValueAtTime(finalVolume, clipEnd);
				}

				const sourceStart = typeof props.sourceStart === "number" ? props.sourceStart : 0;
				const sourceDuration = Math.max(0, clipDuration * speed);
				const safeSourceStart = Math.max(0, Math.min(sourceStart, buffer.duration));
				const remaining = Math.max(0, buffer.duration - safeSourceStart);
				const duration = Math.min(sourceDuration, remaining);

				if (duration > 0) {
					source.start(clipStart, safeSourceStart, duration);
					hasAudio = true;
				}
			}

			if (!hasAudio) return null;
			return offlineContext.startRendering();
		};

		const seekVideoFrame = async (videoEl: HTMLVideoElement, timeSec: number) => {
			const maxTime = Number.isFinite(videoEl.duration) ? videoEl.duration : timeSec;
			const targetTime = Math.max(0, Math.min(timeSec, maxTime));
			if (Math.abs(videoEl.currentTime - targetTime) < 0.001 && videoEl.readyState >= 2) return;
			await new Promise<void>((resolve) => {
				const handleSeeked = () => resolve();
				const handleError = () => resolve();
				videoEl.addEventListener("seeked", handleSeeked, { once: true });
				videoEl.addEventListener("error", handleError, { once: true });
				try {
					videoEl.currentTime = targetTime;
				} catch {
					resolve();
				}
			});
		};

		let stopped = false;
		let audioBuffer: AudioBuffer | null = null;
		if (audioClips.length > 0) {
			setMessage("Rendering audio…");
			try {
				audioBuffer = await renderOfflineAudio(selectedFormat.extension);
			} catch (error) {
				console.error("Failed to render offline audio:", error);
				setMessage("Audio render failed; exporting muted.");
				audioBuffer = null;
			}
		}

		if (audioBuffer && typeof AudioData !== "undefined") {
			audioTrack = createAudioTrack();
			audioWriter = audioTrack.writable.getWriter();
		} else if (audioClips.length > 0) {
			setMessage("AudioData unsupported; exporting muted.");
		}

		const streamTracks: MediaStreamTrack[] = [videoTrack];
		if (audioTrack) streamTracks.push(audioTrack);
		const stream = new MediaStream(streamTracks);
		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream, { mimeType });
		recorderRef.current = recorder;

		let recorderResolve: (() => void) | null = null;
		const recorderStopped = new Promise<void>((resolve) => {
			recorderResolve = resolve;
		});

		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) chunks.push(event.data);
		};
		recorder.onstop = () => {
			recorderRef.current = null;
			setIsExporting(false);
			abortRef.current = null;
			const blob = new Blob(chunks, { type: mimeType });
			if (blob.size === 0) {
				setExportError("No export data was produced.");
				recorderResolve?.();
				return;
			}
			const url = URL.createObjectURL(blob);
			setDownloadUrl(url);
			setMessage(stopped ? "Export canceled." : "Export complete. Download is ready.");
			setProgress(1);
			recorderResolve?.();
		};

		abortRef.current = () => {
			stopped = true;
			videoWriter.abort().catch(() => {
				/* ignore */
			});
			audioWriter?.abort().catch(() => {
				/* ignore */
			});
			recorder.stop();
			releaseVideoDecoders();
			setIsExporting(false);
			setMessage("Export canceled.");
		};

		let currentVideoClipId: string | null = null;
		let currentVideoIterator: AsyncGenerator<VideoSample | null, void, unknown> | null = null;

		const renderVisualFrame = async (timeSec: number, frameIndex: number) => {
			if (!debugState.firstFrame) {
				const initialClip = findActiveClipInTracks(videoTracks, timeSec);
				const initialText = findActiveTextClipsInTracks(textTracks, timeSec);
				console.info("[export] first frame", {
					timeSec,
					frameIndex,
					hasVideoClip: Boolean(initialClip),
					hasTextClip: initialText.length > 0,
					sourcePrepared: initialClip ? preparedSources.has(initialClip.sourceId) : false,
				});
				debugState.firstFrame = true;
				if (!initialClip) {
					debugState.noClip = true;
				}
			}
			if (!webglRenderer) {
				if (!ctx) return;
				ctx.fillStyle = "#000000";
				ctx.fillRect(0, 0, canvas.width, canvas.height);

				const videoClip = findActiveClipInTracks(videoTracks, timeSec);
				if (!videoClip && currentVideoIterator) {
					await currentVideoIterator.return?.();
					currentVideoIterator = null;
					currentVideoClipId = null;
				}
				if (videoClip && preparedSources.has(videoClip.sourceId)) {
					const source = preparedSources.get(videoClip.sourceId)!;
					if (source.type === "video") {
						let sample: VideoSample | null = null;
						if (videoClip.id !== currentVideoClipId) {
							if (currentVideoIterator) {
								await currentVideoIterator.return?.();
							}
							currentVideoClipId = videoClip.id;
							currentVideoIterator = createVideoIteratorForClip(videoClip, frameIndex);
						}
						if (currentVideoIterator) {
							const nextSample = await currentVideoIterator.next();
							sample = nextSample.done ? null : (nextSample.value ?? null);
						}
						if (sample) {
							if (!debugState.drawPathLogged) {
								console.info("[export] draw path", {
									type: "video-sample",
									displayWidth: sample.displayWidth,
									displayHeight: sample.displayHeight,
								});
								debugState.drawPathLogged = true;
							}
							drawSampleToCanvas(ctx, canvas, videoClip, sample, timeSec);
							sample.close();
						} else {
							const videoEl = source.element;
							videoEl.pause();
							const offset = Math.max(0, timeSec - videoClip.start);
							const sourceStart =
								typeof videoClip.props?.sourceStart === "number" ? videoClip.props.sourceStart : 0;
							const videoTime = calculateSourceTime(offset, videoClip.props || {}, sourceStart);
							await seekVideoFrame(videoEl, videoTime);
							if (!debugState.drawPathLogged) {
								console.info("[export] draw path", {
									type: "video-element",
									videoWidth: videoEl.videoWidth,
									videoHeight: videoEl.videoHeight,
									readyState: videoEl.readyState,
								});
								debugState.drawPathLogged = true;
							}
							drawClipToCanvas(ctx, canvas, videoClip, videoEl, timeSec);
						}
					} else if (source.type === "image") {
						if (!debugState.drawPathLogged) {
							console.info("[export] draw path", {
								type: "image",
								naturalWidth: source.element.naturalWidth,
								naturalHeight: source.element.naturalHeight,
							});
							debugState.drawPathLogged = true;
						}
						drawClipToCanvas(ctx, canvas, videoClip, source.element, timeSec);
					}
				}

				const textClips = findActiveTextClipsInTracks(textTracks, timeSec);
				textClips.forEach((tc) => drawTextClip(ctx, canvas, tc, timeSec));
				if (!debugState.pixelLogged) {
					const pixel = ctx.getImageData(0, 0, 1, 1).data;
					console.info("[export] first pixel", {
						r: pixel[0],
						g: pixel[1],
						b: pixel[2],
						a: pixel[3],
					});
					debugState.pixelLogged = true;
				}
				presentFrame();
				return;
			}

			webglRenderer.beginFrame();

			const videoClip = findActiveClipInTracks(videoTracks, timeSec);
			if (!videoClip && currentVideoIterator) {
				await currentVideoIterator.return?.();
				currentVideoIterator = null;
				currentVideoClipId = null;
			}

			const drawWebglClip = (
				clip: Clip,
				sourceId: string,
				source: TexImageSource | VideoFrame,
				mediaWidth: number,
				mediaHeight: number
			) => {
				const params = computeClipRenderParams(
					clip,
					timeSec,
					canvas.width,
					canvas.height,
					mediaWidth,
					mediaHeight
				);
				const positions = buildClipPositions(params, canvas.width, canvas.height);
				const uvs = buildClipUVs(params, mediaWidth, mediaHeight);
				const curves = params.colorCorrection.curves as
					| {
							master: { x: number; y: number }[];
							red: { x: number; y: number }[];
							green: { x: number; y: number }[];
							blue: { x: number; y: number }[];
					  }
					| undefined;
				const curvesLut = curves ? getCurvesLut(curves) : null;
				const effects: WebGLClipEffects = {
					opacity: params.opacity,
					brightness: params.brightness,
					contrast: params.contrast,
					saturation: params.saturation,
					blur: params.blur,
					levels: params.colorCorrection.levels,
					whiteBalance: params.colorCorrection.whiteBalance,
					colorWheel: params.colorCorrection.colorWheel,
					curvesLut,
					chromaKey: params.chromaKey,
					wipeRect: params.wipeRect,
				};
				webglRenderer.drawClip(sourceId, source, mediaWidth, mediaHeight, positions, uvs, effects);
			};

			if (videoClip && preparedSources.has(videoClip.sourceId)) {
				const source = preparedSources.get(videoClip.sourceId)!;
				if (source.type === "video") {
					let sample: VideoSample | null = null;
					if (videoClip.id !== currentVideoClipId) {
						if (currentVideoIterator) {
							await currentVideoIterator.return?.();
						}
						currentVideoClipId = videoClip.id;
						currentVideoIterator = createVideoIteratorForClip(videoClip, frameIndex);
					}
					if (currentVideoIterator) {
						const nextSample = await currentVideoIterator.next();
						sample = nextSample.done ? null : (nextSample.value ?? null);
					}
					if (sample) {
						const displayWidth = sample.displayWidth || sample.codedWidth || canvas.width;
						const displayHeight = sample.displayHeight || sample.codedHeight || canvas.height;
						const source = sample.toCanvasImageSource();
						drawWebglClip(videoClip, videoClip.sourceId, source, displayWidth, displayHeight);
						sample.close();
					} else {
						const videoEl = source.element;
						videoEl.pause();
						const offset = Math.max(0, timeSec - videoClip.start);
						const sourceStart =
							typeof videoClip.props?.sourceStart === "number" ? videoClip.props.sourceStart : 0;
						const videoTime = calculateSourceTime(offset, videoClip.props || {}, sourceStart);
						await seekVideoFrame(videoEl, videoTime);
						drawWebglClip(
							videoClip,
							videoClip.sourceId,
							videoEl,
							videoEl.videoWidth,
							videoEl.videoHeight
						);
					}
				} else if (source.type === "image") {
					drawWebglClip(
						videoClip,
						videoClip.sourceId,
						source.element,
						source.element.naturalWidth || canvas.width,
						source.element.naturalHeight || canvas.height
					);
				}
			}

			if (textCanvas && textCtx) {
				textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
				const textClips = findActiveTextClipsInTracks(textTracks, timeSec);
				textClips.forEach((tc) => drawTextClip(textCtx, textCanvas, tc, timeSec));
				if (textClips.length > 0) {
					const textParams: ClipRenderParams = {
						sx: 0,
						sy: 0,
						sw: textCanvas.width,
						sh: textCanvas.height,
						dx: 0,
						dy: 0,
						dw: canvas.width,
						dh: canvas.height,
						opacity: 1,
						brightness: 1,
						contrast: 1,
						saturation: 1,
						blur: 0,
						wipeRect: null,
						colorCorrection: {},
					};
					const positions = buildClipPositions(textParams, canvas.width, canvas.height);
					const uvs = buildClipUVs(textParams, textCanvas.width, textCanvas.height);
					const effects: WebGLClipEffects = {
						opacity: 1,
						brightness: 1,
						contrast: 1,
						saturation: 1,
						blur: 0,
					};
					webglRenderer.drawClip(
						"__text__",
						textCanvas,
						textCanvas.width,
						textCanvas.height,
						positions,
						uvs,
						effects
					);
				}
			}
			presentFrame();
		};

		setMessage("Encoding video…");
		recorder.start();

		const totalFrames = Math.max(1, Math.ceil(actualDuration * fps));
		const frameDurationUs = Math.round(1_000_000 / fps);
		const yieldInterval = Math.max(1, Math.round(fps));

		try {
			for (let frameIndex = 0; frameIndex < totalFrames && !stopped; frameIndex++) {
				const timeSec = Math.min(frameIndex / fps, actualDuration);
				await renderVisualFrame(timeSec, frameIndex);
				const frameSource = getEncodeSource();
				const frame = new VideoFrame(frameSource, {
					timestamp: Math.round(timeSec * 1_000_000),
					duration: frameDurationUs,
				});
				await videoWriter.write(frame);
				frame.close();

				const progressValue = timeSec / actualDuration;
				const now = performance.now();
				if (now - lastProgressUpdateRef.current >= 150 || progressValue >= 1 || frameIndex === 0) {
					setProgress(progressValue);
					setMessage(`Encoding video… ${frameIndex + 1}/${totalFrames} frames`);
					lastProgressUpdateRef.current = now;
				}
				if (frameIndex % yieldInterval === 0) {
					await yieldToBrowser();
				}
				await maybeYield();
			}
		} catch (error) {
			console.error("Export failed:", error);
			setExportError("Export failed.");
			stopped = true;
		} finally {
			await videoWriter.close().catch(() => {
				/* ignore */
			});
		}

		if (!stopped && audioWriter && audioBuffer) {
			setMessage("Encoding audio…");
			const channels = audioBuffer.numberOfChannels;
			const totalAudioFrames = audioBuffer.length;
			const chunkSize = 1024;
			for (let offset = 0; offset < totalAudioFrames && !stopped; offset += chunkSize) {
				const frameLength = Math.min(chunkSize, totalAudioFrames - offset);
				const interleaved = new Float32Array(frameLength * channels);
				for (let ch = 0; ch < channels; ch++) {
					const channelData = audioBuffer.getChannelData(ch);
					for (let i = 0; i < frameLength; i++) {
						interleaved[i * channels + ch] = channelData[offset + i] ?? 0;
					}
				}
				const audioData = new AudioData({
					format: "f32",
					sampleRate: audioBuffer.sampleRate,
					numberOfChannels: channels,
					numberOfFrames: frameLength,
					timestamp: Math.round((offset / audioBuffer.sampleRate) * 1_000_000),
					data: interleaved,
				});
				await audioWriter.write(audioData);
				audioData.close();
			}
			await audioWriter.close().catch(() => {
				/* ignore */
			});
		}

		if (!stopped) {
			setMessage("Finalizing export…");
			recorder.stop();
			await recorderStopped;
		}

		releaseVideoDecoders();
	};

	const handleCancelExport = () => {
		if (abortRef.current) {
			abortRef.current();
		}
	};

	const totalClips = timeline
		? timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0)
		: 0;
	const summary =
		mounted && timeline
			? `${timeline.name} • ${timeline.duration.toFixed(1)}s • tracks ${timeline.tracks.length}`
			: "Timeline not loaded";

	// Show error if project ID is missing, invalid, or doesn't exist
	const pageDescription =
		"Validate the timeline and export a video locally. Rendering happens in your browser—no uploads.";

	if (!projectId) {
		return (
			<PageShell title="Export" description={pageDescription}>
				<div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center">
					<h2 className="text-xl font-semibold">Project ID Required</h2>
					<p className="text-muted-foreground">
						Please provide a project ID in the URL (e.g., /export?id=your-project-id)
					</p>
					<Button onClick={() => (window.location.href = "/")}>Go to Home</Button>
				</div>
			</PageShell>
		);
	}

	if (!isValidProjectId(projectId)) {
		return (
			<PageShell title="Export" description={pageDescription}>
				<div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center">
					<h2 className="text-xl font-semibold">Invalid Project ID</h2>
					<p className="text-muted-foreground">
						The project ID &ldquo;{projectId}&rdquo; is not a valid format.
					</p>
					<p className="text-muted-foreground text-xs">
						Project IDs must be in UUID v4 format or start with &ldquo;proj_&rdquo;
					</p>
					<Button onClick={() => (window.location.href = "/")}>Go to Home</Button>
				</div>
			</PageShell>
		);
	}

	if (projectExists === false) {
		return (
			<PageShell title="Export" description={pageDescription}>
				<div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-8 text-center">
					<h2 className="text-xl font-semibold">Project Not Found</h2>
					<p className="text-muted-foreground">No project found with ID: {projectId}</p>
					<p className="text-muted-foreground text-xs">
						The project may have been deleted or never existed in this browser.
					</p>
					<div className="flex gap-2">
						<Button onClick={() => (window.location.href = "/")}>Go to Home</Button>
						<Button variant="outline" onClick={() => (window.location.href = "/projects")}>
							View All Projects
						</Button>
					</div>
				</div>
			</PageShell>
		);
	}

	return (
		<PageShell title="Export" description={pageDescription} maxWidth="max-w-5xl">
			<div className="text-foreground grid gap-4 text-xs">
				<div className="border-border bg-card flex flex-wrap items-center gap-2 border px-4 py-3">
					<div className="font-semibold">Project {projectId}</div>
					<div className="text-muted-foreground">{summary}</div>
					<div className="ml-auto flex items-center gap-2">
						<Label>Preset</Label>
						<Select
							value={activePreset?.id ?? selectedPresetId ?? ""}
							onValueChange={setSelectedPresetId}
						>
							<SelectTrigger className="w-auto">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{presets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{preset.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{activePreset && (
							<div className="text-muted-foreground border-border bg-background border px-2 py-1 text-xs">
								{activePreset.aspectRatioLabel} • {activePreset.width}x{activePreset.height} @{" "}
								{activePreset.fps}fps
							</div>
						)}
					</div>
				</div>

				<div className="border-border bg-card grid gap-3 border p-4">
					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={handleValidate} disabled={loading || isExporting} variant="default">
							Validate timeline
						</Button>
						<Button
							onClick={handleStartExport}
							disabled={loading || isExporting || !fastExportSupported}
							variant="default"
						>
							Export video
						</Button>
						<Button onClick={handleAdvice} disabled={loading || isExporting} variant="outline">
							Get advice
						</Button>
						{isExporting && (
							<Button onClick={handleCancelExport} variant="destructive">
								Cancel
							</Button>
						)}
					</div>

					{loading && <div className="text-muted-foreground text-xs">Processing…</div>}
					{!fastExportSupported && (
						<div className="text-muted-foreground text-xs">
							Export requires WebCodecs or MediaStreamTrackGenerator support.
						</div>
					)}
					{exportFormat === "mp4" && !mp4Supported && (
						<div className="text-muted-foreground text-xs">
							MP4 is not supported in this browser; WebM will be used instead.
						</div>
					)}
					{validationResult && (
						<div
							className={`border px-3 py-2 text-xs ${validationResult === "OK" ? "border-primary/50 bg-primary/10 text-primary-foreground" : "border-destructive/50 bg-destructive/10 text-destructive-foreground"}`}
						>
							{validationResult}
						</div>
					)}
					{adviceResult && adviceResult.length > 0 && (
						<div className="text-foreground border-border bg-background/70 grid gap-2 border p-3 text-xs">
							<div className="text-muted-foreground">Advice</div>
							<ul className="list-disc space-y-1 pl-5">
								{adviceResult.map((item, idx) => (
									<li key={idx}>{item}</li>
								))}
							</ul>
						</div>
					)}
				</div>

				<div className="text-foreground border-border bg-card grid gap-2 border p-4 text-xs">
					<div className="flex flex-wrap items-center gap-3">
						<div className="font-semibold">Media status</div>
						<div className="text-muted-foreground">
							Library {mounted ? mediaRecords.length : 0} items / referenced{" "}
							{mounted && timeline ? totalClips : 0} clips
						</div>
					</div>
					{mounted &&
						(missingSources.length === 0 ? (
							<div className="border-primary/50 bg-primary/10 text-primary-foreground border px-3 py-2">
								All referenced media is available.
							</div>
						) : (
							<div className="border-destructive/50 bg-destructive/10 text-destructive-foreground border px-3 py-2">
								Missing media: {missingSources.join(", ")}
							</div>
						))}
				</div>

				<div className="text-foreground border-border bg-card grid gap-2 border p-4 text-xs">
					<div className="flex items-center justify-between">
						<div className="font-semibold">Export preview</div>
						{isExporting && <div className="text-muted-foreground text-xs">Rendering…</div>}
					</div>
					<div className="border-border bg-background flex min-h-[140px] items-center justify-center border">
						<canvas
							ref={canvasRef}
							className={isExporting ? "h-auto w-full" : "hidden"}
							style={previewFlipY ? { transform: "scaleY(-1)" } : undefined}
							aria-hidden={!isExporting}
						/>
						{!isExporting && (
							<div className="text-muted-foreground">Start export to preview frames.</div>
						)}
					</div>
				</div>

				<div className="text-foreground border-border bg-card grid gap-2 border p-4 text-xs">
					<div className="flex items-center justify-between">
						<div className="font-semibold">Export status</div>
						{isExporting && <div className="text-muted-foreground text-xs">In progress…</div>}
					</div>
					<div className="bg-border h-2 overflow-hidden">
						<div
							className="bg-primary h-full transition-[width]"
							style={{ width: `${Math.min(100, Math.floor(progress * 100))}%` }}
						/>
					</div>
					{message && <div className="text-muted-foreground">{message}</div>}
					{exportError && <div className="text-destructive">Error: {exportError}</div>}
					{downloadUrl && (
						<div className="flex items-center gap-3">
							<a
								href={downloadUrl}
								download={`${timeline?.name ?? "arcumark"}_${projectId}.${downloadExtension}`}
								className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center gap-1.5 rounded-none border px-2.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50"
							>
								Download video (.{downloadExtension})
							</a>
							<div className="text-muted-foreground">Done: {Math.round(progress * 100)}%</div>
						</div>
					)}
				</div>
			</div>
		</PageShell>
	);
}

export default function ExportPage() {
	return (
		<Suspense
			fallback={
				<PageShell
					title="Export"
					description="Validate the timeline and export a video locally. Rendering happens in your browser—no uploads."
				>
					<div>Loading...</div>
				</PageShell>
			}
		>
			<ExportPageContent />
		</Suspense>
	);
}
