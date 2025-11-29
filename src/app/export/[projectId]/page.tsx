"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Timeline, validateTimeline } from "@/lib/shared/timeline";

export default function ExportPage() {
	const params = useParams<{ projectId: string }>();
	const projectId = params.projectId;
	const [timeline, setTimeline] = useState<Timeline | null>(null);
	const [validationResult, setValidationResult] = useState<string | null>(null);
	const [adviceResult, setAdviceResult] = useState<string[] | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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
		} catch (e) {
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

	return (
		<div
			style={{
				minHeight: "100vh",
				backgroundColor: "#0f0f0f",
				color: "#f5f5f5",
				padding: "48px",
				display: "flex",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					width: "900px",
					border: "1px solid #2f2f2f",
					backgroundColor: "#151515",
					padding: "24px",
					display: "grid",
					gap: "16px",
				}}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<div>
						<div style={{ fontSize: "22px", fontWeight: 700 }}>Export</div>
						<div style={{ color: "#a1a1aa", fontSize: "14px" }}>Project {projectId}</div>
					</div>
					<div>
						{timeline ? (
							<div style={{ textAlign: "right", fontSize: "13px", color: "#d1d5db" }}>
								<div>{timeline.name}</div>
								<div>Duration: {timeline.duration}s</div>
								<div>Tracks: {timeline.tracks.length}</div>
							</div>
						) : (
							<div style={{ color: "#f87171" }}>No timeline loaded</div>
						)}
					</div>
				</div>
				<div style={{ display: "flex", gap: "12px" }}>
					<button
						style={{
							padding: "10px 16px",
							background: "#3b82f6",
							color: "#0d1117",
							border: "1px solid #2d63b3",
							cursor: "pointer",
							fontWeight: 600,
							borderRadius: "0",
						}}
						onClick={handleValidate}
						disabled={loading}
					>
						Validate timeline
					</button>
					<button
						style={{
							padding: "10px 16px",
							background: "#2a2a2a",
							color: "#e5e5e5",
							border: "1px solid #3a3a3a",
							cursor: "pointer",
							fontWeight: 600,
							borderRadius: "0",
						}}
						onClick={handleAdvice}
						disabled={loading}
					>
						Get advice
					</button>
					<button
						style={{
							padding: "10px 16px",
							background: "#1f1f1f",
							color: "#e5e5e5",
							border: "1px solid #3a3a3a",
							cursor: "pointer",
							fontWeight: 600,
							borderRadius: "0",
						}}
						onClick={() =>
							setMessage("Local export would start here (ffmpeg.wasm integration placeholder).")
						}
						disabled={loading}
					>
						Start local export
					</button>
				</div>
				{loading && <div style={{ color: "#9ca3af" }}>Processing...</div>}
				{validationResult && (
					<div style={{ color: validationResult === "OK" ? "#10b981" : "#f97316" }}>
						{validationResult}
					</div>
				)}
				{adviceResult && adviceResult.length > 0 && (
					<div style={{ display: "grid", gap: "6px" }}>
						<div style={{ fontWeight: 600 }}>Advice</div>
						<ul style={{ margin: 0, paddingLeft: "18px", color: "#d1d5db" }}>
							{adviceResult.map((a, idx) => (
								<li key={idx}>{a}</li>
							))}
						</ul>
					</div>
				)}
				{message && <div style={{ color: "#d1d5db" }}>{message}</div>}
			</div>
		</div>
	);
}
