"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { PropertyKeyframes, EasingFunction } from "@/lib/animation/keyframes";

type Props = {
	value: PropertyKeyframes;
	clipDuration: number;
	onChange: (value: PropertyKeyframes) => void;
	onDelete?: () => void;
};

const EASING_OPTIONS: { value: EasingFunction; label: string }[] = [
	{ value: "linear", label: "Linear" },
	{ value: "easeIn", label: "Ease In" },
	{ value: "easeOut", label: "Ease Out" },
	{ value: "easeInOut", label: "Ease In/Out" },
	{ value: "easeInQuad", label: "Ease In Quad" },
	{ value: "easeOutQuad", label: "Ease Out Quad" },
	{ value: "easeInOutQuad", label: "Ease In/Out Quad" },
	{ value: "easeInCubic", label: "Ease In Cubic" },
	{ value: "easeOutCubic", label: "Ease Out Cubic" },
	{ value: "easeInOutCubic", label: "Ease In/Out Cubic" },
	{ value: "easeInQuart", label: "Ease In Quart" },
	{ value: "easeOutQuart", label: "Ease Out Quart" },
	{ value: "easeInOutQuart", label: "Ease In/Out Quart" },
	{ value: "easeInExpo", label: "Ease In Expo" },
	{ value: "easeOutExpo", label: "Ease Out Expo" },
	{ value: "easeInOutExpo", label: "Ease In/Out Expo" },
	{ value: "easeInBack", label: "Ease In Back" },
	{ value: "easeOutBack", label: "Ease Out Back" },
	{ value: "easeInOutBack", label: "Ease In/Out Back" },
	{ value: "easeInElastic", label: "Ease In Elastic" },
	{ value: "easeOutElastic", label: "Ease Out Elastic" },
	{ value: "easeInOutElastic", label: "Ease In/Out Elastic" },
	{ value: "bounceIn", label: "Bounce In" },
	{ value: "bounceOut", label: "Bounce Out" },
	{ value: "bounceInOut", label: "Bounce In/Out" },
];

export function KeyframeEditor({ value, clipDuration, onChange, onDelete }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<number | null>(null);
	const [draggingKeyframe, setDraggingKeyframe] = useState<number | null>(null);

	const drawCurve = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;
		const padding = 40;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Draw grid
		ctx.strokeStyle = "#333";
		ctx.lineWidth = 1;
		for (let i = 0; i <= 4; i++) {
			const pos = padding + (i * (width - padding * 2)) / 4;
			ctx.beginPath();
			ctx.moveTo(pos, padding);
			ctx.lineTo(pos, height - padding);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(padding, pos);
			ctx.lineTo(width - padding, pos);
			ctx.stroke();
		}

		// Sort keyframes by time
		const sorted = [...value.keyframes].sort((a, b) => a.time - b.time);

		if (sorted.length === 0) {
			// Draw horizontal line if no keyframes
			ctx.strokeStyle = "#666";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, height / 2);
			ctx.lineTo(width - padding, height / 2);
			ctx.stroke();
		} else {
			// Find min/max values for normalization
			const values = sorted.map((kf) => kf.value);
			const minValue = Math.min(...values);
			const maxValue = Math.max(...values);
			const valueRange = maxValue - minValue || 1;

			// Draw curve
			ctx.strokeStyle = "#3b82f6";
			ctx.lineWidth = 2;
			ctx.beginPath();

			for (let i = 0; i < sorted.length; i++) {
				const x = padding + (sorted[i].time / clipDuration) * (width - padding * 2);
				const normalizedValue = (sorted[i].value - minValue) / valueRange;
				const y = height - padding - normalizedValue * (height - padding * 2);

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					// Draw interpolated curve between keyframes
					const prevKf = sorted[i - 1];
					const prevX = padding + (prevKf.time / clipDuration) * (width - padding * 2);
					const prevNormalized = (prevKf.value - minValue) / valueRange;
					const prevY = height - padding - prevNormalized * (height - padding * 2);

					// Draw curve segment with easing preview
					const steps = 20;
					for (let j = 0; j <= steps; j++) {
						const t = j / steps;
						const localX = prevX + (x - prevX) * t;
						const easing = sorted[i].easing || "linear";
						const easedT = applyEasingPreview(t, easing);
						const localY = prevY + (y - prevY) * easedT;
						if (j === 0) {
							ctx.moveTo(localX, localY);
						} else {
							ctx.lineTo(localX, localY);
						}
					}
				}
			}
			ctx.stroke();

			// Draw keyframe points
			ctx.fillStyle = "#3b82f6";
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 2;
			for (let i = 0; i < sorted.length; i++) {
				const x = padding + (sorted[i].time / clipDuration) * (width - padding * 2);
				const normalizedValue = (sorted[i].value - minValue) / valueRange;
				const y = height - padding - normalizedValue * (height - padding * 2);

				// Find original index in value.keyframes
				const originalIndex = value.keyframes.findIndex(
					(kf) => kf.time === sorted[i].time && kf.value === sorted[i].value
				);
				const isSelected = selectedKeyframeIndex === originalIndex;
				ctx.beginPath();
				ctx.arc(x, y, isSelected ? 8 : 6, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}
	}, [value, clipDuration, selectedKeyframeIndex]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const x = (e.clientX - rect.left - 40) / (canvas.width - 80);
			const time = Math.max(0, Math.min(clipDuration, x * clipDuration));

			const sorted = [...value.keyframes].sort((a, b) => a.time - b.time);
			const values = sorted.map((kf) => kf.value);
			const minValue = Math.min(...(values.length > 0 ? values : [0]));
			const maxValue = Math.max(...(values.length > 0 ? values : [0]));
			const valueRange = maxValue - minValue || 1;

			const y = 1 - (e.clientY - rect.top - 40) / (canvas.height - 80);
			const keyframeValue = minValue + y * valueRange;

			// Check if clicking on existing keyframe (use pixel distance for better accuracy)
			const canvasWidth = canvas.width - 80;
			const canvasHeight = canvas.height - 80;
			const clickX = e.clientX - rect.left - 40;
			const clickY = e.clientY - rect.top - 40;
			const hitRadius = 10; // pixels

			let closestKeyframe: { index: number; dist: number } | null = null;

			for (let i = 0; i < sorted.length; i++) {
				const kfX = (sorted[i].time / clipDuration) * canvasWidth;
				const normalizedValue = (sorted[i].value - minValue) / valueRange;
				const kfY = (1 - normalizedValue) * canvasHeight;

				const dist = Math.sqrt(Math.pow(clickX - kfX, 2) + Math.pow(clickY - kfY, 2));

				// Find original index in value.keyframes
				const originalIndex = value.keyframes.findIndex(
					(kf) => kf.time === sorted[i].time && kf.value === sorted[i].value
				);

				if (
					dist < hitRadius &&
					originalIndex >= 0 &&
					(!closestKeyframe || dist < closestKeyframe.dist)
				) {
					closestKeyframe = { index: originalIndex, dist };
				}
			}

			if (closestKeyframe) {
				setSelectedKeyframeIndex(closestKeyframe.index);
				setDraggingKeyframe(closestKeyframe.index);
			} else {
				// Add new keyframe
				const newKeyframes = [
					...value.keyframes,
					{ time, value: keyframeValue, easing: "linear" as EasingFunction },
				];
				onChange({ ...value, keyframes: newKeyframes });
				setSelectedKeyframeIndex(newKeyframes.length - 1);
				setDraggingKeyframe(newKeyframes.length - 1);
			}
		},
		[value, clipDuration, onChange]
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (draggingKeyframe === null || !canvasRef.current) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const x = (e.clientX - rect.left - 40) / (canvas.width - 80);
			const time = Math.max(0, Math.min(clipDuration, x * clipDuration));

			const sorted = [...value.keyframes].sort((a, b) => a.time - b.time);
			const values = sorted.map((kf) => kf.value);
			const minValue = Math.min(...(values.length > 0 ? values : [0]));
			const maxValue = Math.max(...(values.length > 0 ? values : [0]));
			const valueRange = maxValue - minValue || 1;

			const y = 1 - (e.clientY - rect.top - 40) / (canvas.height - 80);
			const newValue = minValue + y * valueRange;

			const keyframes = [...value.keyframes];
			const originalKf = keyframes[draggingKeyframe];
			keyframes[draggingKeyframe] = { ...originalKf, time, value: newValue };
			onChange({ ...value, keyframes });
		},
		[draggingKeyframe, value, clipDuration, onChange]
	);

	const handleMouseUp = useCallback(() => {
		setDraggingKeyframe(null);
	}, []);

	useEffect(() => {
		drawCurve();
	}, [drawCurve]);

	const selectedKeyframe =
		selectedKeyframeIndex !== null ? value.keyframes[selectedKeyframeIndex] : null;

	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between">
				<Label className="text-xs font-semibold">{value.property}</Label>
				{onDelete && (
					<Button variant="outline" size="sm" onClick={onDelete}>
						Remove
					</Button>
				)}
			</div>
			<canvas
				ref={canvasRef}
				width={300}
				height={150}
				className="border-border cursor-crosshair border"
				onMouseDown={handleMouseDown}
				onMouseMove={draggingKeyframe !== null ? handleMouseMove : undefined}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			/>
			{selectedKeyframe && (
				<div className="grid gap-2 border-t pt-2">
					<div className="grid grid-cols-2 gap-2">
						<div className="grid gap-1">
							<Label className="text-xs">Time (s)</Label>
							<Input
								type="number"
								min={0}
								max={clipDuration}
								step={0.1}
								value={selectedKeyframe.time.toFixed(2)}
								onChange={(e) => {
									const newTime = parseFloat(e.target.value) || 0;
									const keyframes = [...value.keyframes];
									keyframes[selectedKeyframeIndex!] = {
										...selectedKeyframe,
										time: Math.max(0, Math.min(clipDuration, newTime)),
									};
									onChange({ ...value, keyframes });
								}}
								className="h-8 text-xs"
							/>
						</div>
						<div className="grid gap-1">
							<Label className="text-xs">Value</Label>
							<Input
								type="number"
								step={0.1}
								value={selectedKeyframe.value.toFixed(2)}
								onChange={(e) => {
									const newValue = parseFloat(e.target.value) || 0;
									const keyframes = [...value.keyframes];
									keyframes[selectedKeyframeIndex!] = {
										...selectedKeyframe,
										value: newValue,
									};
									onChange({ ...value, keyframes });
								}}
								className="h-8 text-xs"
							/>
						</div>
					</div>
					<div className="grid gap-1">
						<Label className="text-xs">Easing</Label>
						<Select
							value={selectedKeyframe.easing || "linear"}
							onValueChange={(easing) => {
								const keyframes = [...value.keyframes];
								keyframes[selectedKeyframeIndex!] = {
									...selectedKeyframe,
									easing: easing as EasingFunction,
								};
								onChange({ ...value, keyframes });
							}}
						>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{EASING_OPTIONS.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							const keyframes = value.keyframes.filter((_, i) => i !== selectedKeyframeIndex);
							onChange({ ...value, keyframes });
							setSelectedKeyframeIndex(null);
						}}
					>
						Delete Keyframe
					</Button>
				</div>
			)}
		</div>
	);
}

function applyEasingPreview(t: number, easing: EasingFunction): number {
	// Simplified easing preview (full implementation in keyframes.ts)
	const clampedT = Math.max(0, Math.min(1, t));
	switch (easing) {
		case "linear":
			return clampedT;
		case "easeIn":
			return clampedT * clampedT;
		case "easeOut":
			return 1 - (1 - clampedT) * (1 - clampedT);
		case "easeInOut":
			return clampedT < 0.5 ? 2 * clampedT * clampedT : 1 - Math.pow(-2 * clampedT + 2, 2) / 2;
		default:
			return clampedT;
	}
}
