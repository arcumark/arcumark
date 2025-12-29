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
import { AudioProcessor } from "@/lib/audio/audio-processor";
import { getAudioContext } from "@/lib/audio/audio-context";
import { calculateNormalizeGain } from "@/lib/audio/normalize";
import { calculateSourceTime } from "@/lib/timing/speed-utils";
import {
	applyLevels,
	applyWhiteBalance,
	applyColorWheel,
	applyCurves,
	type ColorCorrectionProps,
} from "@/lib/color/color-correction";
import { getAnimatedProperties, type ClipKeyframes } from "@/lib/animation/keyframes";

// This page is fully client-side and requires no server-side processing
export const dynamic = "force-static";
export const dynamicParams = true;

type LoadedMediaRecord = StoredMediaRecord & { url: string };

type PreparedSource =
	| { type: "video"; element: HTMLVideoElement }
	| { type: "image"; element: HTMLImageElement };

function findActiveClip(timeline: Timeline, kind: "video" | "audio" | "text", time: number) {
	for (const track of timeline.tracks) {
		if (track.kind !== kind) continue;
		const clip = track.clips.find((c) => time >= c.start && time < c.end);
		if (clip) return clip;
	}
	return null;
}

function findActiveTextClips(timeline: Timeline, time: number) {
	return timeline.tracks
		.filter((track) => track.kind === "text")
		.flatMap((track) => track.clips.filter((clip) => time >= clip.start && time < clip.end));
}

function clampOpacity(value: unknown, fallback = 1) {
	if (typeof value !== "number" || Number.isNaN(value)) return fallback;
	return Math.min(1, Math.max(0, value / 100));
}

function ExportPageContent() {
	const searchParams = useSearchParams();
	const projectId = searchParams?.get("id");

	const [timeline] = useState<Timeline | null>(() => {
		if (!projectId) return null;
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
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(() => {
		const storedPreset =
			(typeof localStorage !== "undefined" && localStorage.getItem("arcumark:lastPreset")) || null;
		return storedPreset ?? VIDEO_PRESETS[0]?.id ?? null;
	});
	const [mediaRecords, setMediaRecords] = useState<LoadedMediaRecord[]>([]);
	const [isExporting, setIsExporting] = useState(false);
	const [progress, setProgress] = useState(0);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);

	const missingSources = useMemo(() => {
		if (!timeline) return [];
		const usedIds = new Set<string>();
		timeline.tracks.forEach((track) => track.clips.forEach((clip) => usedIds.add(clip.sourceId)));
		return Array.from(usedIds).filter((id) => !mediaRecords.some((m) => m.id === id));
	}, [timeline, mediaRecords]);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const abortRef = useRef<(() => void) | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const audioGainRef = useRef<GainNode | null>(null);
	const audioProcessorRef = useRef<AudioProcessor | null>(null);

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
		if (timeline.duration <= 0) {
			setExportError("Timeline duration is 0 seconds.");
			return;
		}
		if (missingSources.length > 0) {
			setExportError(`Missing media: ${missingSources.join(", ")}`);
			return;
		}
		if (typeof MediaRecorder === "undefined") {
			setExportError("This browser does not support MediaRecorder.");
			return;
		}
		const canvas = canvasRef.current;
		if (!canvas || typeof canvas.captureStream !== "function") {
			setExportError("Failed to initialize canvas.");
			return;
		}

		setExportError(null);
		setMessage("Preparing media…");
		setDownloadUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});
		setProgress(0);

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

		const preparedSources = await prepareSources();

		const fps = activePreset.fps || 30;
		canvas.width = activePreset.width;
		canvas.height = activePreset.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			setExportError("Failed to initialize canvas.");
			return;
		}

		const canvasStream = canvas.captureStream(fps);
		const audioElement = document.createElement("audio");
		audioElement.crossOrigin = "anonymous";
		audioElement.preload = "auto";
		audioElement.muted = false;

		let audioStream: MediaStream | null = null;
		let audioProcessor: AudioProcessor | null = null;
		if (typeof AudioContext !== "undefined") {
			try {
				const audioContext = getAudioContext();
				audioProcessor = new AudioProcessor();
				audioProcessor.attachSource(audioElement);

				const destination = audioContext.createMediaStreamDestination();
				audioProcessor.connect(destination);

				audioContext.resume().catch(() => {
					/* ignore */
				});

				audioContextRef.current = audioContext;
				audioProcessorRef.current = audioProcessor;

				// silence speakers while keeping capture path alive
				audioElement.volume = 0;
				audioStream = destination.stream;
			} catch (error) {
				console.error("Failed to initialize AudioProcessor:", error);
				// Fallback to basic audio if Web Audio API fails
				audioStream =
					(audioElement as unknown as { captureStream?: () => MediaStream }).captureStream?.() ??
					null;
				audioElement.volume = 1;
			}
		} else {
			audioStream =
				(audioElement as unknown as { captureStream?: () => MediaStream }).captureStream?.() ??
				null;
			// fallback: allow audible output if captureStream is used
			audioElement.volume = 1;
		}

		if (!audioStream) {
			setMessage("Audio capture unavailable; exporting muted.");
		}

		const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
		if (audioStream) {
			tracks.push(...audioStream.getAudioTracks());
		}
		const stream = new MediaStream(tracks);
		if (tracks.length === 0) {
			setExportError("Failed to create recording stream.");
			return;
		}

		const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
			? "video/webm;codecs=vp9,opus"
			: "video/webm";

		const chunks: Blob[] = [];
		const recorder = new MediaRecorder(stream, { mimeType });
		recorderRef.current = recorder;

		let stopped = false;
		let raf: number | null = null;
		let currentAudioClipId: string | null = null;
		let currentVideoClipId: string | null = null;
		const startTime = performance.now();
		const frameInterval = 1000 / fps;
		let lastFrame = 0;

		abortRef.current = () => {
			stopped = true;
			recorder.stop();
			audioElement.pause();
			if (audioContextRef.current) {
				audioContextRef.current.close().catch(() => {
					/* ignore */
				});
				audioContextRef.current = null;
				audioGainRef.current = null;
			}
			if (raf) cancelAnimationFrame(raf);
			setIsExporting(false);
			setMessage("Export canceled.");
		};

		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = () => {
			if (raf) cancelAnimationFrame(raf);
			audioElement.pause();
			if (audioContextRef.current) {
				audioContextRef.current.close().catch(() => {
					/* ignore */
				});
				audioContextRef.current = null;
				audioGainRef.current = null;
			}
			setIsExporting(false);
			abortRef.current = null;
			const blob = new Blob(chunks, { type: mimeType });
			if (blob.size === 0) {
				setExportError("No export data was produced.");
				return;
			}
			const url = URL.createObjectURL(blob);
			setDownloadUrl(url);
			setMessage(stopped ? "Export canceled." : "Export complete. Download is ready.");
			setProgress(1);
		};

		const applyWipeClip = (
			ctx: CanvasRenderingContext2D,
			direction: string,
			progress: number,
			width: number,
			height: number
		) => {
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
		};

		const drawClipToCanvas = (
			clip: Clip,
			element: HTMLVideoElement | HTMLImageElement,
			timeSec: number
		) => {
			const mediaWidth =
				element instanceof HTMLVideoElement
					? element.videoWidth
					: element.naturalWidth || canvas.width;
			const mediaHeight =
				element instanceof HTMLVideoElement
					? element.videoHeight
					: element.naturalHeight || canvas.height;
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

			ctx.drawImage(element, sx, sy, sw, sh, dx, dy, dw, dh);

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

			if (hasColorCorrection) {
				// Get image data from the drawn area (convert to integers for getImageData)
				const x = Math.floor(dx);
				const y = Math.floor(dy);
				const w = Math.ceil(dw);
				const h = Math.ceil(dh);
				const imageData = ctx.getImageData(x, y, w, h);
				// Apply color correction synchronously (without LUT for performance)
				let correctedData = imageData;
				if (colorCorrection.levels) {
					correctedData = applyLevels(correctedData, colorCorrection.levels);
				}
				if (colorCorrection.whiteBalance) {
					correctedData = applyWhiteBalance(correctedData, colorCorrection.whiteBalance);
				}
				if (colorCorrection.colorWheel) {
					correctedData = applyColorWheel(correctedData, colorCorrection.colorWheel);
				}
				if (colorCorrection.curves) {
					correctedData = applyCurves(correctedData, colorCorrection.curves);
				}
				ctx.putImageData(correctedData, x, y);
			}

			ctx.restore();
		};

		const drawTextClip = (clip: Clip, timeSec: number) => {
			const props = clip.props || {};
			const text =
				typeof props.text === "string" && props.text.length > 0 ? (props.text as string) : "Text";
			const size = typeof props.size === "number" ? props.size : 24;
			const color =
				typeof props.color === "string" && props.color.length > 0
					? (props.color as string)
					: "#ffffff";
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
		};

		const renderFrame = (timeSec: number) => {
			ctx.fillStyle = "#000000";
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			const videoClip = timeline && findActiveClip(timeline, "video", timeSec);
			if (videoClip && preparedSources.has(videoClip.sourceId)) {
				const source = preparedSources.get(videoClip.sourceId)!;
				if (source.type === "video") {
					const videoEl = source.element;
					const offset = Math.max(0, timeSec - videoClip.start);
					const sourceStart =
						typeof videoClip.props?.sourceStart === "number" ? videoClip.props.sourceStart : 0;
					const videoTime = calculateSourceTime(offset, videoClip.props || {}, sourceStart);

					// Apply playback speed (basic speed only, not for speed ramping)
					if (!videoClip.props?.speedRampingEnabled) {
						const speed =
							typeof videoClip.props?.playbackSpeed === "number"
								? videoClip.props.playbackSpeed
								: 1.0;
						videoEl.playbackRate = Math.abs(speed);
					} else {
						videoEl.playbackRate = 1.0; // Speed ramping uses seeking only
					}

					if (Math.abs(videoEl.currentTime - videoTime) > 0.1 && !videoEl.seeking) {
						try {
							videoEl.currentTime = Math.max(0, videoTime);
						} catch {
							/* ignore seek errors */
						}
					}
					if (videoClip.id !== currentVideoClipId && videoEl.paused) {
						videoEl.play().catch(() => {
							/* ignore */
						});
					}
					currentVideoClipId = videoClip.id;
					drawClipToCanvas(videoClip, videoEl, timeSec);
				} else if (source.type === "image") {
					drawClipToCanvas(videoClip, source.element, timeSec);
					currentVideoClipId = videoClip.id;
				}
			} else {
				currentVideoClipId = null;
			}

			const textClips = timeline ? findActiveTextClips(timeline, timeSec) : [];
			textClips.forEach((tc) => drawTextClip(tc, timeSec));

			const audioClip = timeline && findActiveClip(timeline, "audio", timeSec);
			if (audioClip) {
				const media = mediaRecords.find((m) => m.id === audioClip.sourceId);
				if (media) {
					const offset = Math.max(0, timeSec - audioClip.start);
					const audioSourceStart =
						typeof audioClip.props?.sourceStart === "number" ? audioClip.props.sourceStart : 0;
					const audioTime = calculateSourceTime(offset, audioClip.props || {}, audioSourceStart);

					// Apply playback speed for audio
					const audioSpeed =
						typeof audioClip.props?.playbackSpeed === "number"
							? Math.abs(audioClip.props.playbackSpeed)
							: 1.0;
					audioElement.playbackRate = audioSpeed;

					if (audioClip.id !== currentAudioClipId) {
						audioElement.src = media.url;
						audioElement.currentTime = Math.max(0, audioTime);
						audioElement.play().catch(() => {
							/* ignore */
						});
						currentAudioClipId = audioClip.id;
					} else if (Math.abs(audioElement.currentTime - audioTime) > 0.2) {
						audioElement.currentTime = Math.max(0, audioTime);
					}

					// Update audio processor settings (EQ, effects, etc.)
					if (audioProcessorRef.current) {
						audioProcessorRef.current.updateSettings(audioClip.props || {});
					}

					// Calculate fade transition volume
					const clipProgress = timeSec - audioClip.start;
					const clipRemaining = audioClip.end - timeSec;
					let volumeMultiplier = 1.0;

					const fadeIn = Math.min(
						(audioClip.props?.fadeIn as number) || 0,
						audioClip.end - audioClip.start
					);
					const fadeOut = Math.min(
						(audioClip.props?.fadeOut as number) || 0,
						audioClip.end - audioClip.start
					);

					if (fadeIn > 0 && clipProgress < fadeIn) {
						volumeMultiplier = Math.max(0, Math.min(1, clipProgress / fadeIn));
					} else if (fadeOut > 0 && clipRemaining < fadeOut) {
						volumeMultiplier = Math.max(0, Math.min(1, clipRemaining / fadeOut));
					}

					const baseVolume =
						typeof audioClip.props?.volume === "number"
							? Math.min(1, Math.max(0, audioClip.props.volume / 100))
							: 1;
					let finalVolume = baseVolume * volumeMultiplier;

					// Apply normalization if enabled
					if (audioClip.props?.normalizeEnabled) {
						const peakLevel = (audioClip.props?.peakLevelDb as number) || 0;
						const targetLevel = (audioClip.props?.normalizeTarget as number) || -1;
						const normalizeGain = calculateNormalizeGain(peakLevel, targetLevel);
						finalVolume *= normalizeGain;
					}

					if (audioProcessorRef.current) {
						audioProcessorRef.current.setVolume(finalVolume);
						audioElement.volume = 0; // keep local output silent
					} else if (audioGainRef.current) {
						audioGainRef.current.gain.value = finalVolume;
						audioElement.volume = 0; // keep local output silent
					} else {
						audioElement.volume = finalVolume;
					}
				}
			} else if (!audioElement.paused) {
				audioElement.pause();
				currentAudioClipId = null;
			}
		};

		setIsExporting(true);
		setMessage("Starting export…");
		recorder.start();

		const tick = (now: number) => {
			const elapsed = Math.min((now - startTime) / 1000, timeline.duration);
			if (now - lastFrame >= frameInterval - 2) {
				renderFrame(elapsed);
				setProgress(elapsed / timeline.duration);
				lastFrame = now;
			}
			if (elapsed >= timeline.duration || stopped) {
				recorder.stop();
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	};

	const handleCancelExport = () => {
		if (abortRef.current) {
			abortRef.current();
		}
	};

	const totalClips = timeline
		? timeline.tracks.reduce((sum, track) => sum + track.clips.length, 0)
		: 0;
	const summary = timeline
		? `${timeline.name} • ${timeline.duration.toFixed(1)}s • tracks ${timeline.tracks.length}`
		: "Timeline not loaded";

	// Show error if project ID is missing, invalid, or doesn't exist
	if (!projectId) {
		return (
			<PageShell title="Export" description="Export your video project">
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
			<PageShell title="Export" description="Export your video project">
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

	if (!projectExistsInLocalStorage(projectId)) {
		return (
			<PageShell title="Export" description="Export your video project">
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
		<PageShell
			title="Export"
			description="Validate the timeline and export a WebM locally. Rendering happens in your browser—no uploads."
			maxWidth="max-w-5xl"
		>
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
						<Button onClick={handleStartExport} disabled={loading || isExporting} variant="default">
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
							Library {mediaRecords.length} items / referenced {totalClips} clips
						</div>
					</div>
					{missingSources.length === 0 ? (
						<div className="border-primary/50 bg-primary/10 text-primary-foreground border px-3 py-2">
							All referenced media is available.
						</div>
					) : (
						<div className="border-destructive/50 bg-destructive/10 text-destructive-foreground border px-3 py-2">
							Missing media: {missingSources.join(", ")}
						</div>
					)}
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
								download={`${timeline?.name ?? "arcumark"}_${projectId}.webm`}
								className="bg-primary text-primary-foreground hover:bg-primary/80 inline-flex h-8 items-center justify-center gap-1.5 rounded-none border px-2.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50"
							>
								Download video (.webm)
							</a>
							<div className="text-muted-foreground">Done: {Math.round(progress * 100)}%</div>
						</div>
					)}
				</div>
			</div>
			<canvas ref={canvasRef} className="hidden" aria-hidden />
		</PageShell>
	);
}

export default function ExportPage() {
	return (
		<Suspense
			fallback={
				<PageShell title="Export" description="Loading export page...">
					<div>Loading...</div>
				</PageShell>
			}
		>
			<ExportPageContent />
		</Suspense>
	);
}
