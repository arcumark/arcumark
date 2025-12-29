"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ColorWheelAdjustment } from "@/lib/color/color-correction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
	value: ColorWheelAdjustment;
	onChange: (value: ColorWheelAdjustment) => void;
};

export function ColorWheel({ value, onChange }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDragging, setIsDragging] = useState(false);

	const drawWheel = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const size = canvas.width;
		const center = size / 2;
		const radius = size / 2 - 10;

		// Clear canvas
		ctx.clearRect(0, 0, size, size);

		// Draw color wheel
		for (let angle = 0; angle < 360; angle += 1) {
			const startAngle = (angle * Math.PI) / 180;
			const endAngle = ((angle + 1) * Math.PI) / 180;

			// Create gradient for saturation
			for (let s = 0; s <= 100; s += 5) {
				const innerRadius = radius * (s / 100);
				const outerRadius = radius * ((s + 5) / 100);

				const hue = angle / 360;
				const saturation = s / 100;
				const lightness = 0.5;

				const rgb = hslToRgb(hue, saturation, lightness);
				ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

				ctx.beginPath();
				ctx.arc(center, center, outerRadius, startAngle, endAngle);
				ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
				ctx.closePath();
				ctx.fill();
			}
		}

		// Draw current selection indicator
		const hueRad = (value.hue * Math.PI) / 180;
		const sat = Math.abs(value.saturation) / 100;
		const x = center + Math.cos(hueRad) * radius * sat;
		const y = center + Math.sin(hueRad) * radius * sat;

		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(x, y, 8, 0, Math.PI * 2);
		ctx.stroke();

		ctx.strokeStyle = "#000";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(x, y, 8, 0, Math.PI * 2);
		ctx.stroke();
	}, [value]);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!canvasRef.current) return;

			const canvas = canvasRef.current;
			const rect = canvas.getBoundingClientRect();
			const x = e.clientX - rect.left - canvas.width / 2;
			const y = e.clientY - rect.top - canvas.height / 2;

			const distance = Math.sqrt(x * x + y * y);
			const radius = canvas.width / 2 - 10;
			const sat = Math.min(1, distance / radius);
			const hue = (Math.atan2(y, x) * 180) / Math.PI;

			onChange({
				...value,
				hue: hue,
				saturation: sat * 100 * (value.saturation >= 0 ? 1 : -1),
			});
		},
		[value, onChange]
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			setIsDragging(true);
			handleMouseMove(e);
		},
		[handleMouseMove]
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	// Redraw wheel when value changes
	useEffect(() => {
		drawWheel();
	}, [drawWheel]);

	return (
		<div className="relative">
			<canvas
				ref={canvasRef}
				width={200}
				height={200}
				className="border-border cursor-crosshair rounded-full border"
				onMouseDown={handleMouseDown}
				onMouseMove={isDragging ? handleMouseMove : undefined}
				onMouseUp={handleMouseUp}
				onMouseLeave={handleMouseUp}
			/>
			<div className="mt-2 grid grid-cols-3 gap-2">
				<div className="grid gap-1">
					<Label className="text-xs">Hue</Label>
					<Input
						type="number"
						min={-180}
						max={180}
						value={Math.round(value.hue)}
						onChange={(e) => onChange({ ...value, hue: parseFloat(e.target.value) || 0 })}
						className="h-8 text-xs"
					/>
				</div>
				<div className="grid gap-1">
					<Label className="text-xs">Sat</Label>
					<Input
						type="number"
						min={-100}
						max={100}
						value={Math.round(value.saturation)}
						onChange={(e) => onChange({ ...value, saturation: parseFloat(e.target.value) || 0 })}
						className="h-8 text-xs"
					/>
				</div>
				<div className="grid gap-1">
					<Label className="text-xs">Light</Label>
					<Input
						type="number"
						min={-100}
						max={100}
						value={Math.round(value.lightness)}
						onChange={(e) => onChange({ ...value, lightness: parseFloat(e.target.value) || 0 })}
						className="h-8 text-xs"
					/>
				</div>
			</div>
		</div>
	);
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	let r: number, g: number, b: number;

	if (s === 0) {
		r = g = b = l;
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;

		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255),
	};
}
