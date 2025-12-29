export async function decodeAudioFile(
	url: string,
	audioContext: AudioContext
): Promise<AudioBuffer> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	return await audioContext.decodeAudioData(arrayBuffer);
}
