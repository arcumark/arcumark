export type AudioEffectSettings = {
	// Equalizer (dB units, -12 ~ +12)
	eqLow?: number; // Default: 0
	eqMid?: number; // Default: 0
	eqHigh?: number; // Default: 0

	// Effect enable/disable
	compressorEnabled?: boolean; // Default: false
	delayEnabled?: boolean; // Default: false
	reverbEnabled?: boolean; // Default: false

	// Compressor settings
	compressorThreshold?: number; // -100 ~ 0 dB, default: -24
	compressorRatio?: number; // 1 ~ 20, default: 12

	// Delay settings
	delayTime?: number; // 0 ~ 2 seconds, default: 0.5
	delayFeedback?: number; // 0 ~ 0.9, default: 0.4

	// Reverb settings
	reverbMix?: number; // 0 ~ 1, default: 0.3
	reverbType?: "small" | "medium" | "large" | "hall"; // Default: 'medium'

	// Normalization
	normalizeEnabled?: boolean; // Default: false
	normalizeTarget?: number; // -3 ~ 0 dB, default: -1
	peakLevelDb?: number; // Automatically calculated when loading file
};

export type Clip = {
	id: string;
	start: number;
	end: number;
	sourceId: string;
	props?: Record<string, unknown>;
};

export type Track = {
	id: string;
	kind: "video" | "audio" | "text";
	clips: Clip[];
};

export type Timeline = {
	id: string;
	name: string;
	duration: number;
	tracks: Track[];
};

export type TimelineValidationResult =
	| { ok: true; timeline: Timeline }
	| { ok: false; errors: string[] };
