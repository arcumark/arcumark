"use client";

import { useCallback, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { LevelsAdjustment } from "@/lib/color/color-correction";
import { generateHistogram } from "@/lib/color/color-correction";

type Props = {
	value: LevelsAdjustment;
	histogramData?: ImageData | null;
	onChange: (value: LevelsAdjustment) => void;
};

export function LevelsEditor({ value, histogramData, onChange }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const drawHistogram = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas || !histogramData) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;
		const padding = 40;

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Generate histogram
		const histogram = generateHistogram(histogramData);
		const maxCount = Math.max(...histogram.luminance);

		// Draw histogram
		ctx.fillStyle = "#666";
		const barWidth = (width - padding * 2) / 256;
		for (let i = 0; i < 256; i++) {
			const barHeight = (histogram.luminance[i] / maxCount) * (height - padding * 2);
			ctx.fillRect(padding + i * barWidth, height - padding - barHeight, barWidth, barHeight);
		}

		// Draw input level markers
		ctx.strokeStyle = "#f00";
		ctx.lineWidth = 2;
		const inputBlackX = padding + (value.inputBlack / 255) * (width - padding * 2);
		const inputWhiteX = padding + (value.inputWhite / 255) * (width - padding * 2);
		ctx.beginPath();
		ctx.moveTo(inputBlackX, padding);
		ctx.lineTo(inputBlackX, height - padding);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(inputWhiteX, padding);
		ctx.lineTo(inputWhiteX, height - padding);
		ctx.stroke();

		// Draw output level markers
		ctx.strokeStyle = "#0f0";
		ctx.lineWidth = 2;
		const outputBlackX = padding + (value.outputBlack / 255) * (width - padding * 2);
		const outputWhiteX = padding + (value.outputWhite / 255) * (width - padding * 2);
		ctx.beginPath();
		ctx.moveTo(outputBlackX, padding);
		ctx.lineTo(outputBlackX, height - padding);
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(outputWhiteX, padding);
		ctx.lineTo(outputWhiteX, height - padding);
		ctx.stroke();
	}, [histogramData, value]);

	useEffect(() => {
		drawHistogram();
	}, [drawHistogram]);

	return (
		<div className="grid gap-3">
			<canvas ref={canvasRef} width={300} height={150} className="border-border border" />
			<div className="grid gap-2">
				<div className="grid gap-2">
					<Label className="text-xs">Input Black ({value.inputBlack})</Label>
					<Slider
						min={0}
						max={255}
						step={1}
						value={[value.inputBlack]}
						onValueChange={(values) =>
							onChange({ ...value, inputBlack: Array.isArray(values) ? values[0] : values })
						}
					/>
				</div>
				<div className="grid gap-2">
					<Label className="text-xs">Input White ({value.inputWhite})</Label>
					<Slider
						min={0}
						max={255}
						step={1}
						value={[value.inputWhite]}
						onValueChange={(values) =>
							onChange({ ...value, inputWhite: Array.isArray(values) ? values[0] : values })
						}
					/>
				</div>
				<div className="grid gap-2">
					<Label className="text-xs">Output Black ({value.outputBlack})</Label>
					<Slider
						min={0}
						max={255}
						step={1}
						value={[value.outputBlack]}
						onValueChange={(values) =>
							onChange({ ...value, outputBlack: Array.isArray(values) ? values[0] : values })
						}
					/>
				</div>
				<div className="grid gap-2">
					<Label className="text-xs">Output White ({value.outputWhite})</Label>
					<Slider
						min={0}
						max={255}
						step={1}
						value={[value.outputWhite]}
						onValueChange={(values) =>
							onChange({ ...value, outputWhite: Array.isArray(values) ? values[0] : values })
						}
					/>
				</div>
				<div className="grid gap-2">
					<Label className="text-xs">Gamma ({value.gamma.toFixed(2)})</Label>
					<Slider
						min={0.1}
						max={3.0}
						step={0.01}
						value={[value.gamma]}
						onValueChange={(values) =>
							onChange({ ...value, gamma: Array.isArray(values) ? values[0] : values })
						}
					/>
				</div>
			</div>
		</div>
	);
}
