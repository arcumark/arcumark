"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { readAllMediaRecords, type StoredMediaRecord } from "@/lib/client/media-store";
import { VIDEO_PRESETS, type VideoPreset } from "@/lib/shared/presets";
import { Clip, Timeline, validateTimeline } from "@/lib/shared/timeline";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

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

export default function ExportPage() {
	const params = useParams<{ projectId: string }>();
	const projectId = params.projectId;

	const [timeline, setTimeline] = useState<Timeline | null>(null);
	const [validationResult, setValidationResult] = useState<string | null>(null);
	const [adviceResult, setAdviceResult] = useState<string[] | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [presets, setPresets] = useState<VideoPreset[]>(VIDEO_PRESETS);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [mediaRecords, setMediaRecords] = useState<LoadedMediaRecord[]>([]);
	const [missingSources, setMissingSources] = useState<string[]>([]);
	const [isExporting, setIsExporting] = useState(false);
	const [progress, setProgress] = useState(0);
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const abortRef = useRef<(() => void) | null>(null);
	const recorderRef = useRef<MediaRecorder | null>(null);
	const audioContextRef = useRef<AudioContext | null>(null);
	const audioGainRef = useRef<GainNode | null>(null);

	useEffect(() => {
		const storedPreset =
			(typeof localStorage !== "undefined" && localStorage.getItem("arcumark:lastPreset")) || null;
		setSelectedPresetId(storedPreset ?? VIDEO_PRESETS[0]?.id ?? null);
		setPresets(VIDEO_PRESETS);
	}, []);

	useEffect(() => {
		try {
			const stored = localStorage.getItem(`arcumark:timeline:${projectId}`);
			if (stored) {
				const parsed = JSON.parse(stored);
				const validation = validateTimeline(parsed);
				if (validation.ok) {
					setTimeline(validation.timeline);
				}
			}
		} catch (e) {
			console.error("Failed to load timeline", e);
		}
	}, [projectId]);

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

	useEffect(() => {
		if (!timeline) return;
		const usedIds = new Set<string>();
		timeline.tracks.forEach((track) => track.clips.forEach((clip) => usedIds.add(clip.sourceId)));
		const missing = Array.from(usedIds).filter((id) => !mediaRecords.some((m) => m.id === id));
		setMissingSources(missing);
	}, [timeline, mediaRecords]);

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
		if (typeof AudioContext !== "undefined") {
			const ctxAudio = new AudioContext();
			const source = ctxAudio.createMediaElementSource(audioElement);
			const gain = ctxAudio.createGain();
			source.connect(gain);
			const destination = ctxAudio.createMediaStreamDestination();
			gain.connect(destination);
			ctxAudio.resume().catch(() => {
				/* ignore */
			});
			audioContextRef.current = ctxAudio;
			audioGainRef.current = gain;
			// silence speakers while keeping capture path alive
			audioElement.volume = 0;
			audioStream = destination.stream;
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

		const drawClipToCanvas = (clip: Clip, element: HTMLVideoElement | HTMLImageElement) => {
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
			const dx = (canvas.width - dw) / 2 + (typeof props.tx === "number" ? props.tx : 0);
			const dy = (canvas.height - dh) / 2 + (typeof props.ty === "number" ? props.ty : 0);

			ctx.save();
			ctx.globalAlpha = clampOpacity(props.opacity, 1);
			ctx.drawImage(element, sx, sy, sw, sh, dx, dy, dw, dh);
			ctx.restore();
		};

		const drawTextClip = (clip: Clip) => {
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
			const rotation = typeof props.rotation === "number" ? props.rotation : 0;
			const xPct = typeof props.x === "number" ? props.x : 50;
			const yPct = typeof props.y === "number" ? props.y : 50;
			const posX = (xPct / 100) * canvas.width;
			const posY = (yPct / 100) * canvas.height;
			const lines = text.split("\n");

			ctx.save();
			ctx.translate(posX, posY);
			ctx.rotate((rotation * Math.PI) / 180);
			ctx.textAlign = align;
			ctx.textBaseline = "middle";
			ctx.globalAlpha = clampOpacity(props.opacity, 1);
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
					if (Math.abs(videoEl.currentTime - offset) > 0.1 && !videoEl.seeking) {
						try {
							videoEl.currentTime = offset;
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
					drawClipToCanvas(videoClip, videoEl);
				} else if (source.type === "image") {
					drawClipToCanvas(videoClip, source.element);
					currentVideoClipId = videoClip.id;
				}
			} else {
				currentVideoClipId = null;
			}

			const textClips = timeline ? findActiveTextClips(timeline, timeSec) : [];
			textClips.forEach(drawTextClip);

			const audioClip = timeline && findActiveClip(timeline, "audio", timeSec);
			if (audioClip) {
				const media = mediaRecords.find((m) => m.id === audioClip.sourceId);
				if (media) {
					const offset = Math.max(0, timeSec - audioClip.start);
					if (audioClip.id !== currentAudioClipId) {
						audioElement.src = media.url;
						audioElement.currentTime = offset;
						audioElement.play().catch(() => {
							/* ignore */
						});
						currentAudioClipId = audioClip.id;
					} else if (Math.abs(audioElement.currentTime - offset) > 0.2) {
						audioElement.currentTime = offset;
					}
					const volume =
						typeof audioClip.props?.volume === "number"
							? Math.min(1, Math.max(0, audioClip.props.volume / 100))
							: 1;
					if (audioGainRef.current) {
						audioGainRef.current.gain.value = volume;
						audioElement.volume = 0; // keep local output silent
					} else {
						audioElement.volume = volume;
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

	return (
		<PageShell
			title="Export"
			description="Validate the timeline and export a WebM locally. Rendering happens in your browser—no uploads."
			maxWidth="max-w-5xl"
		>
			<div className="text-foreground grid gap-4 text-xs">
				<div className="flex flex-wrap items-center gap-2 border border-neutral-800 bg-neutral-900 px-4 py-3">
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
							<div className="text-muted-foreground border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs">
								{activePreset.aspectRatioLabel} • {activePreset.width}x{activePreset.height} @{" "}
								{activePreset.fps}fps
							</div>
						)}
					</div>
				</div>

				<div className="grid gap-3 border border-neutral-800 bg-neutral-900 p-4">
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
						<div className="text-foreground grid gap-2 border border-neutral-800 bg-neutral-950/70 p-3 text-xs">
							<div className="text-muted-foreground">Advice</div>
							<ul className="list-disc space-y-1 pl-5">
								{adviceResult.map((item, idx) => (
									<li key={idx}>{item}</li>
								))}
							</ul>
						</div>
					)}
				</div>

				<div className="text-foreground grid gap-2 border border-neutral-800 bg-neutral-900 p-4 text-xs">
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

				<div className="text-foreground grid gap-2 border border-neutral-800 bg-neutral-900 p-4 text-xs">
					<div className="flex items-center justify-between">
						<div className="font-semibold">Export status</div>
						{isExporting && <div className="text-muted-foreground text-xs">In progress…</div>}
					</div>
					<div className="h-2 overflow-hidden bg-neutral-800">
						<div
							className="bg-primary h-full transition-[width]"
							style={{ width: `${Math.min(100, Math.floor(progress * 100))}%` }}
						/>
					</div>
					{message && <div className="text-muted-foreground">{message}</div>}
					{exportError && <div className="text-destructive">Error: {exportError}</div>}
					{downloadUrl && (
						<div className="flex items-center gap-3">
							<Button asChild>
								<a
									href={downloadUrl}
									download={`${timeline?.name ?? "arcumark"}_${projectId}.webm`}
								>
									Download video (.webm)
								</a>
							</Button>
							<div className="text-muted-foreground">Done: {Math.round(progress * 100)}%</div>
						</div>
					)}
				</div>
			</div>
			<canvas ref={canvasRef} className="hidden" aria-hidden />
		</PageShell>
	);
}
