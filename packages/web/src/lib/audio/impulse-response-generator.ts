export function generateImpulseResponse(
	audioContext: AudioContext,
	type: "small" | "medium" | "large" | "hall"
): AudioBuffer {
	const params = {
		small: { duration: 0.5, decay: 3 },
		medium: { duration: 1.0, decay: 2.5 },
		large: { duration: 2.0, decay: 2 },
		hall: { duration: 3.0, decay: 1.5 },
	}[type];

	const sampleRate = audioContext.sampleRate;
	const length = sampleRate * params.duration;
	const buffer = audioContext.createBuffer(2, length, sampleRate);

	for (let channel = 0; channel < 2; channel++) {
		const channelData = buffer.getChannelData(channel);
		for (let i = 0; i < length; i++) {
			const noise = Math.random() * 2 - 1;
			const decay = Math.pow(1 - i / length, params.decay);
			channelData[i] = noise * decay;
		}
	}

	return buffer;
}
