import { decodeAudioFile } from "./audio-utils";

export async function generateWaveformData(
	audioBuffer: AudioBuffer,
	targetWidth: number = 1000
): Promise<Float32Array> {
	const channelData = audioBuffer.getChannelData(0); // Use first channel (mono)
	const samples = channelData.length;
	const samplesPerPixel = Math.floor(samples / targetWidth);
	const waveformData = new Float32Array(targetWidth);

	for (let i = 0; i < targetWidth; i++) {
		const start = i * samplesPerPixel;
		const end = start + samplesPerPixel;
		let sum = 0;
		let count = 0;

		for (let j = start; j < end && j < samples; j++) {
			sum += Math.abs(channelData[j]);
			count++;
		}

		waveformData[i] = count > 0 ? sum / count : 0;
	}

	return waveformData;
}

export function drawWaveform(
	ctx: CanvasRenderingContext2D,
	waveformData: Float32Array,
	width: number,
	height: number,
	color: string = "#10b981"
) {
	ctx.clearRect(0, 0, width, height);
	ctx.fillStyle = color;

	const barWidth = width / waveformData.length;
	const centerY = height / 2;

	for (let i = 0; i < waveformData.length; i++) {
		const barHeight = waveformData[i] * height;
		const x = i * barWidth;
		const y = centerY - barHeight / 2;

		ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
	}
}

export { decodeAudioFile };
