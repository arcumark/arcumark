"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorCurves } from "@/lib/color/color-correction";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";

type Props = {
	value: ColorCurves;
	onChange: (value: ColorCurves) => void;
};

export function CurvesEditor({ value, onChange }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [activeChannel, setActiveChannel] = useState<"master" | "red" | "green" | "blue">("master");
	const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

	const drawCurve = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;
		const padding = 20;

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

		// Draw curve
		const points = value[activeChannel];
		if (points.length === 0) {
			// Draw diagonal line if no points
			ctx.strokeStyle = "#666";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(padding, height - padding);
			ctx.lineTo(width - padding, padding);
			ctx.stroke();
		} else {
			// Draw curve
			ctx.strokeStyle =
				activeChannel === "master"
					? "#fff"
					: activeChannel === "red"
						? "#f00"
						: activeChannel === "green"
							? "#0f0"
							: "#00f";
			ctx.lineWidth = 2;
			ctx.beginPath();

			const sortedPoints = [...points].sort((a, b) => a.x - b.x);
			for (let i = 0; i < sortedPoints.length; i++) {
				const x = padding + sortedPoints[i].x * (width - padding * 2);
				const y = height - padding - sortedPoints[i].y * (height - padding * 2);
				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			}
			ctx.stroke();

			// Draw control points
			ctx.fillStyle = "#fff";
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 1;
			for (const point of sortedPoints) {
				const x = padding + point.x * (width - padding * 2);
				const y = height - padding - point.y * (height - padding * 2);
				ctx.beginPath();
				ctx.arc(x, y, 6, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
			}
		}
	}, [value, activeChannel]);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const x = (e.clientX - rect.left - 20) / (canvas.width - 40);
			const y = 1 - (e.clientY - rect.top - 20) / (canvas.height - 40);

			const clampedX = Math.max(0, Math.min(1, x));
			const clampedY = Math.max(0, Math.min(1, y));

			const points = value[activeChannel];
			let closestIndex = -1;
			let closestDist = Infinity;

			for (let i = 0; i < points.length; i++) {
				const dist = Math.sqrt(
					Math.pow(points[i].x - clampedX, 2) + Math.pow(points[i].y - clampedY, 2)
				);
				if (dist < closestDist && dist < 0.1) {
					closestDist = dist;
					closestIndex = i;
				}
			}

			if (closestIndex >= 0) {
				setDraggingPoint(closestIndex);
			} else {
				// Add new point
				const newPoints = [...points, { x: clampedX, y: clampedY }];
				onChange({ ...value, [activeChannel]: newPoints });
				setDraggingPoint(newPoints.length - 1);
			}
		},
		[value, activeChannel, onChange]
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (draggingPoint === null || !canvasRef.current) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const x = (e.clientX - rect.left - 20) / (canvas.width - 40);
			const y = 1 - (e.clientY - rect.top - 20) / (canvas.height - 40);

			const clampedX = Math.max(0, Math.min(1, x));
			const clampedY = Math.max(0, Math.min(1, y));

			const points = [...value[activeChannel]];
			points[draggingPoint] = { x: clampedX, y: clampedY };
			onChange({ ...value, [activeChannel]: points });
		},
		[draggingPoint, value, activeChannel, onChange]
	);

	const handleMouseUp = useCallback(() => {
		setDraggingPoint(null);
	}, []);

	useEffect(() => {
		drawCurve();
	}, [drawCurve]);

	return (
		<div className="grid gap-2">
			<div className="flex gap-1">
				{(["master", "red", "green", "blue"] as const).map((channel) => (
					<Toggle
						key={channel}
						pressed={activeChannel === channel}
						onPressedChange={() => setActiveChannel(channel)}
						className="px-2 py-1 text-xs"
						size="sm"
					>
						{channel.charAt(0).toUpperCase() + channel.slice(1)}
					</Toggle>
				))}
			</div>
			<canvas
				ref={canvasRef}
				width={300}
				height={200}
				className="border-border cursor-crosshair border"
				onMouseDown={handleMouseDown}
				onMouseMove={draggingPoint !== null ? handleMouseMove : undefined}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			/>
			<Button
				variant="outline"
				size="sm"
				onClick={() => {
					onChange({ ...value, [activeChannel]: [] });
				}}
			>
				Reset {activeChannel.charAt(0).toUpperCase() + activeChannel.slice(1)}
			</Button>
		</div>
	);
}
