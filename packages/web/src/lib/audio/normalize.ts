export function calculatePeakLevel(audioBuffer: AudioBuffer): number {
	let peak = 0;

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
		const channelData = audioBuffer.getChannelData(channel);
		for (let i = 0; i < channelData.length; i++) {
			const sample = Math.abs(channelData[i]);
			if (sample > peak) {
				peak = sample;
			}
		}
	}

	// Convert linear to dB
	if (peak === 0) {
		return -Infinity;
	}
	return 20 * Math.log10(peak);
}

export function calculateNormalizeGain(peakLevelDb: number, targetLevelDb: number = -1): number {
	if (!isFinite(peakLevelDb)) {
		return 1.0;
	}

	// Calculate required gain in dB
	const gainDb = targetLevelDb - peakLevelDb;

	// Convert dB to linear gain
	return Math.pow(10, gainDb / 20);
}
