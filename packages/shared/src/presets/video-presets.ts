import type { VideoPreset } from "../types/preset.js";

export const VIDEO_PRESETS: VideoPreset[] = [
	{
		id: "1080p_h30",
		name: "1920x1080 30fps",
		width: 1920,
		height: 1080,
		fps: 30,
		aspectRatioLabel: "16:9",
	},
	{
		id: "vertical_1080x1920_30",
		name: "1080x1920 30fps",
		width: 1080,
		height: 1920,
		fps: 30,
		aspectRatioLabel: "9:16",
	},
	{
		id: "square_1080",
		name: "1080x1080 30fps",
		width: 1080,
		height: 1080,
		fps: 30,
		aspectRatioLabel: "1:1",
	},
];
