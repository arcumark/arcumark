/**
 * Color correction utilities for video editing
 */

export type ColorWheelAdjustment = {
	hue: number; // -180 to 180 degrees
	saturation: number; // -100 to 100
	lightness: number; // -100 to 100
};

export type CurvePoint = {
	x: number; // 0 to 1
	y: number; // 0 to 1
};

export type ColorCurves = {
	master: CurvePoint[];
	red: CurvePoint[];
	green: CurvePoint[];
	blue: CurvePoint[];
};

export type LevelsAdjustment = {
	inputBlack: number; // 0 to 255
	inputWhite: number; // 0 to 255
	outputBlack: number; // 0 to 255
	outputWhite: number; // 0 to 255
	gamma: number; // 0.1 to 3.0
};

export type WhiteBalance = {
	temperature: number; // 2000 to 8000 K
	tint: number; // -150 to 150
};

export type ColorCorrectionProps = {
	colorWheel?: ColorWheelAdjustment;
	curves?: ColorCurves;
	levels?: LevelsAdjustment;
	whiteBalance?: WhiteBalance;
	lutUrl?: string; // URL to LUT image file
};

/**
 * Apply color wheel adjustments to an image data
 */
export function applyColorWheel(imageData: ImageData, adjustment: ColorWheelAdjustment): ImageData {
	const data = new Uint8ClampedArray(imageData.data);
	const { hue, saturation, lightness } = adjustment;

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];

		// Convert RGB to HSL
		const hsl = rgbToHsl(r, g, b);

		// Apply hue shift
		if (hue !== 0) {
			hsl.h = (hsl.h + hue / 360) % 1;
			if (hsl.h < 0) hsl.h += 1;
		}

		// Apply saturation adjustment
		if (saturation !== 0) {
			hsl.s = Math.max(0, Math.min(1, hsl.s + saturation / 100));
		}

		// Apply lightness adjustment
		if (lightness !== 0) {
			hsl.l = Math.max(0, Math.min(1, hsl.l + lightness / 100));
		}

		// Convert back to RGB
		const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
		data[i] = rgb.r;
		data[i + 1] = rgb.g;
		data[i + 2] = rgb.b;
	}

	return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply color curves to an image data
 */
export function applyCurves(imageData: ImageData, curves: ColorCurves): ImageData {
	const data = new Uint8ClampedArray(imageData.data);

	// Build lookup tables for each channel
	const masterLut = buildCurveLut(curves.master);
	const redLut = buildCurveLut(curves.red);
	const greenLut = buildCurveLut(curves.green);
	const blueLut = buildCurveLut(curves.blue);

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];

		// Apply master curve
		const masterR = masterLut[r];
		const masterG = masterLut[g];
		const masterB = masterLut[b];

		// Apply channel-specific curves
		data[i] = Math.max(0, Math.min(255, redLut[masterR]));
		data[i + 1] = Math.max(0, Math.min(255, greenLut[masterG]));
		data[i + 2] = Math.max(0, Math.min(255, blueLut[masterB]));
	}

	return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply levels adjustment to an image data
 */
export function applyLevels(imageData: ImageData, levels: LevelsAdjustment): ImageData {
	const data = new Uint8ClampedArray(imageData.data);
	const { inputBlack, inputWhite, outputBlack, outputWhite, gamma } = levels;

	const inputRange = inputWhite - inputBlack;
	const outputRange = outputWhite - outputBlack;

	for (let i = 0; i < data.length; i += 4) {
		// Input levels
		let r = (data[i] - inputBlack) / inputRange;
		let g = (data[i + 1] - inputBlack) / inputRange;
		let b = (data[i + 2] - inputBlack) / inputRange;

		// Gamma correction
		r = Math.pow(Math.max(0, Math.min(1, r)), 1 / gamma);
		g = Math.pow(Math.max(0, Math.min(1, g)), 1 / gamma);
		b = Math.pow(Math.max(0, Math.min(1, b)), 1 / gamma);

		// Output levels
		r = r * outputRange + outputBlack;
		g = g * outputRange + outputBlack;
		b = b * outputRange + outputBlack;

		data[i] = Math.max(0, Math.min(255, r));
		data[i + 1] = Math.max(0, Math.min(255, g));
		data[i + 2] = Math.max(0, Math.min(255, b));
	}

	return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply white balance adjustment to an image data
 */
export function applyWhiteBalance(imageData: ImageData, whiteBalance: WhiteBalance): ImageData {
	const data = new Uint8ClampedArray(imageData.data);
	const { temperature, tint } = whiteBalance;

	// Convert temperature and tint to RGB multipliers
	const multipliers = temperatureToRgb(temperature, tint);

	for (let i = 0; i < data.length; i += 4) {
		data[i] = Math.max(0, Math.min(255, data[i] * multipliers.r));
		data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * multipliers.g));
		data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * multipliers.b));
	}

	return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply LUT (Lookup Table) to an image data
 */
export async function applyLut(imageData: ImageData, lutImageUrl: string): Promise<ImageData> {
	try {
		const lutImage = await loadImage(lutImageUrl);
		const lutCanvas = document.createElement("canvas");
		lutCanvas.width = lutImage.width;
		lutCanvas.height = lutImage.height;
		const lutCtx = lutCanvas.getContext("2d");
		if (!lutCtx) throw new Error("Failed to get 2D context");

		lutCtx.drawImage(lutImage, 0, 0);
		const lutData = lutCtx.getImageData(0, 0, lutCanvas.width, lutCanvas.height);

		// Assume 3D LUT format (e.g., 64x64x64 cube)
		const lutSize = Math.cbrt(lutData.width * lutData.height);
		const data = new Uint8ClampedArray(imageData.data);

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];

			// Sample from 3D LUT
			const lutR = Math.floor((r / 255) * (lutSize - 1));
			const lutG = Math.floor((g / 255) * (lutSize - 1));
			const lutB = Math.floor((b / 255) * (lutSize - 1));

			// Calculate index in flattened LUT
			const lutIndex = (lutB * lutSize * lutSize + lutG * lutSize + lutR) * 4;
			const lutX = lutIndex % lutData.width;
			const lutY = Math.floor(lutIndex / lutData.width);

			if (lutX < lutData.width && lutY < lutData.height) {
				const pixelIndex = (lutY * lutData.width + lutX) * 4;
				data[i] = lutData.data[pixelIndex];
				data[i + 1] = lutData.data[pixelIndex + 1];
				data[i + 2] = lutData.data[pixelIndex + 2];
			}
		}

		return new ImageData(data, imageData.width, imageData.height);
	} catch (error) {
		console.error("Failed to apply LUT:", error);
		return imageData;
	}
}

/**
 * Apply all color corrections to an image data
 */
export async function applyColorCorrection(
	imageData: ImageData,
	props: ColorCorrectionProps
): Promise<ImageData> {
	let result = imageData;

	if (props.levels) {
		result = applyLevels(result, props.levels);
	}

	if (props.whiteBalance) {
		result = applyWhiteBalance(result, props.whiteBalance);
	}

	if (props.colorWheel) {
		result = applyColorWheel(result, props.colorWheel);
	}

	if (props.curves) {
		result = applyCurves(result, props.curves);
	}

	if (props.lutUrl) {
		result = await applyLut(result, props.lutUrl);
	}

	return result;
}

// Helper functions

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
				break;
			case g:
				h = ((b - r) / d + 2) / 6;
				break;
			case b:
				h = ((r - g) / d + 4) / 6;
				break;
		}
	}

	return { h, s, l };
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

function buildCurveLut(points: CurvePoint[]): number[] {
	const lut: number[] = Array.from({ length: 256 });
	const sortedPoints = [...points].sort((a, b) => a.x - b.x);

	for (let i = 0; i < 256; i++) {
		const x = i / 255;
		let y = x;

		if (sortedPoints.length === 0) {
			y = x;
		} else if (x <= sortedPoints[0].x) {
			y = sortedPoints[0].y;
		} else if (x >= sortedPoints[sortedPoints.length - 1].x) {
			y = sortedPoints[sortedPoints.length - 1].y;
		} else {
			for (let j = 0; j < sortedPoints.length - 1; j++) {
				if (x >= sortedPoints[j].x && x <= sortedPoints[j + 1].x) {
					const t = (x - sortedPoints[j].x) / (sortedPoints[j + 1].x - sortedPoints[j].x);
					y = sortedPoints[j].y + t * (sortedPoints[j + 1].y - sortedPoints[j].y);
					break;
				}
			}
		}

		lut[i] = Math.round(y * 255);
	}

	return lut;
}

function temperatureToRgb(temperature: number, tint: number): { r: number; g: number; b: number } {
	// Convert temperature (K) to RGB multipliers
	// Based on black body radiation approximation
	let r = 1;
	let g = 1;
	let b = 1;

	// Temperature adjustment
	if (temperature < 6500) {
		// Warm (yellow/orange)
		r = 1;
		g = 0.39 * Math.log(temperature / 100) - 0.5;
		b = 0.543 * Math.log(temperature / 100) - 0.8;
	} else {
		// Cool (blue)
		r = 0.543 * Math.log(temperature / 100) - 0.8;
		g = 0.39 * Math.log(temperature / 100) - 0.5;
		b = 1;
	}

	// Tint adjustment (green/magenta)
	const tintFactor = tint / 150;
	r += tintFactor * 0.1;
	g -= tintFactor * 0.05;
	b -= tintFactor * 0.1;

	// Normalize
	const max = Math.max(r, g, b);
	if (max > 1) {
		r /= max;
		g /= max;
		b /= max;
	}

	return { r, g, b };
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

/**
 * Generate histogram data from image data
 */
export function generateHistogram(imageData: ImageData): {
	r: number[];
	g: number[];
	b: number[];
	luminance: number[];
} {
	const r = Array.from({ length: 256 }, () => 0);
	const g = Array.from({ length: 256 }, () => 0);
	const b = Array.from({ length: 256 }, () => 0);
	const luminance = Array.from({ length: 256 }, () => 0);

	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		const rVal = data[i];
		const gVal = data[i + 1];
		const bVal = data[i + 2];
		const lum = Math.round(0.299 * rVal + 0.587 * gVal + 0.114 * bVal);

		r[rVal]++;
		g[gVal]++;
		b[bVal]++;
		luminance[lum]++;
	}

	return { r, g, b, luminance };
}
