let globalAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
	if (!globalAudioContext) {
		const AudioContextClass =
			window.AudioContext ||
			(window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext ||
			window.AudioContext;
		globalAudioContext = new AudioContextClass();
	}

	if (globalAudioContext.state === "suspended") {
		globalAudioContext.resume();
	}

	return globalAudioContext;
}

export function closeAudioContext() {
	if (globalAudioContext) {
		globalAudioContext.close();
		globalAudioContext = null;
	}
}
