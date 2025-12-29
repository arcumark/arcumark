import { getAudioContext } from "./audio-context";
import { generateImpulseResponse } from "./impulse-response-generator";

export interface AudioEffectSettings {
	// Equalizer (dB units, -12 ~ +12)
	eqLow?: number;
	eqMid?: number;
	eqHigh?: number;

	// Effect enable/disable
	compressorEnabled?: boolean;
	delayEnabled?: boolean;
	reverbEnabled?: boolean;

	// Compressor settings
	compressorThreshold?: number; // -100 ~ 0 dB
	compressorRatio?: number; // 1 ~ 20

	// Delay settings
	delayTime?: number; // 0 ~ 2 seconds
	delayFeedback?: number; // 0 ~ 0.9

	// Reverb settings
	reverbMix?: number; // 0 ~ 1
	reverbType?: "small" | "medium" | "large" | "hall";
}

export class AudioProcessor {
	private audioContext: AudioContext;
	private sourceNode: MediaElementAudioSourceNode | null = null;
	private gainNode: GainNode;

	// EQ nodes (always created)
	private lowEqNode: BiquadFilterNode;
	private midEqNode: BiquadFilterNode;
	private highEqNode: BiquadFilterNode;

	// Effect nodes (created on demand)
	private compressorNode: DynamicsCompressorNode | null = null;
	private delayNode: DelayNode | null = null;
	private delayFeedbackNode: GainNode | null = null;
	private reverbNode: ConvolverNode | null = null;
	private dryGainNode: GainNode | null = null;
	private wetGainNode: GainNode | null = null;

	private currentSettings: AudioEffectSettings = {};
	private outputDestination: AudioNode | null = null;

	constructor() {
		this.audioContext = getAudioContext();
		this.gainNode = this.audioContext.createGain();

		// Create EQ nodes (always active)
		this.lowEqNode = this.audioContext.createBiquadFilter();
		this.lowEqNode.type = "lowshelf";
		this.lowEqNode.frequency.value = 100;

		this.midEqNode = this.audioContext.createBiquadFilter();
		this.midEqNode.type = "peaking";
		this.midEqNode.frequency.value = 1000;
		this.midEqNode.Q.value = 1.0;

		this.highEqNode = this.audioContext.createBiquadFilter();
		this.highEqNode.type = "highshelf";
		this.highEqNode.frequency.value = 10000;
	}

	attachSource(audioElement: HTMLAudioElement): void {
		if (!this.sourceNode) {
			this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
			this.rebuildGraph();
		}
	}

	updateSettings(settings: Record<string, unknown>): void {
		this.currentSettings = settings as AudioEffectSettings;

		// Update EQ (can be done without rebuilding)
		this.lowEqNode.gain.value = (settings.eqLow as number) || 0;
		this.midEqNode.gain.value = (settings.eqMid as number) || 0;
		this.highEqNode.gain.value = (settings.eqHigh as number) || 0;

		// Update compressor parameters if it exists
		if (this.compressorNode && settings.compressorEnabled) {
			this.compressorNode.threshold.value = (settings.compressorThreshold as number) || -24;
			this.compressorNode.ratio.value = (settings.compressorRatio as number) || 12;
		}

		// Update delay parameters if it exists
		if (this.delayNode && settings.delayEnabled) {
			this.delayNode.delayTime.value = (settings.delayTime as number) || 0.5;
			if (this.delayFeedbackNode) {
				this.delayFeedbackNode.gain.value = (settings.delayFeedback as number) || 0.4;
			}
		}

		// Update reverb mix if it exists
		if (settings.reverbEnabled && this.dryGainNode && this.wetGainNode) {
			const mix = (settings.reverbMix as number) || 0.3;
			this.dryGainNode.gain.value = 1 - mix;
			this.wetGainNode.gain.value = mix;
		}

		// Check if we need to rebuild the graph (effect enabled/disabled or reverb type changed)
		const needsRebuild =
			(settings.compressorEnabled && !this.compressorNode) ||
			(!settings.compressorEnabled && this.compressorNode) ||
			(settings.delayEnabled && !this.delayNode) ||
			(!settings.delayEnabled && this.delayNode) ||
			(settings.reverbEnabled && !this.reverbNode) ||
			(!settings.reverbEnabled && this.reverbNode);

		if (needsRebuild) {
			this.rebuildGraph();
		}
	}

	private rebuildGraph(): void {
		if (!this.sourceNode) return;

		// Disconnect all nodes
		this.disconnectAll();

		// Destroy old effect nodes
		if (!this.currentSettings.compressorEnabled) {
			this.compressorNode = null;
		}
		if (!this.currentSettings.delayEnabled) {
			this.delayNode = null;
			this.delayFeedbackNode = null;
		}
		if (!this.currentSettings.reverbEnabled) {
			this.reverbNode = null;
			this.dryGainNode = null;
			this.wetGainNode = null;
		}

		// Create new effect nodes if needed
		if (this.currentSettings.compressorEnabled && !this.compressorNode) {
			this.compressorNode = this.audioContext.createDynamicsCompressor();
			this.compressorNode.threshold.value = this.currentSettings.compressorThreshold || -24;
			this.compressorNode.ratio.value = this.currentSettings.compressorRatio || 12;
			this.compressorNode.knee.value = 30;
			this.compressorNode.attack.value = 0.003;
			this.compressorNode.release.value = 0.25;
		}

		if (this.currentSettings.delayEnabled && !this.delayNode) {
			this.delayNode = this.audioContext.createDelay(2.0);
			this.delayNode.delayTime.value = this.currentSettings.delayTime || 0.5;
			this.delayFeedbackNode = this.audioContext.createGain();
			this.delayFeedbackNode.gain.value = this.currentSettings.delayFeedback || 0.4;
		}

		if (this.currentSettings.reverbEnabled && !this.reverbNode) {
			this.reverbNode = this.audioContext.createConvolver();
			this.dryGainNode = this.audioContext.createGain();
			this.wetGainNode = this.audioContext.createGain();

			const irBuffer = generateImpulseResponse(
				this.audioContext,
				this.currentSettings.reverbType || "medium"
			);
			this.reverbNode.buffer = irBuffer;

			const mix = this.currentSettings.reverbMix || 0.3;
			this.dryGainNode.gain.value = 1 - mix;
			this.wetGainNode.gain.value = mix;
		}

		// Build the node chain: source → EQ → effects → gain → output
		let currentNode: AudioNode = this.sourceNode;

		// Always connect EQ
		currentNode.connect(this.lowEqNode);
		this.lowEqNode.connect(this.midEqNode);
		this.midEqNode.connect(this.highEqNode);
		currentNode = this.highEqNode;

		// Connect compressor if enabled
		if (this.compressorNode) {
			currentNode.connect(this.compressorNode);
			currentNode = this.compressorNode;
		}

		// Connect delay if enabled (with feedback loop)
		if (this.delayNode && this.delayFeedbackNode) {
			currentNode.connect(this.delayNode);
			this.delayNode.connect(this.delayFeedbackNode);
			this.delayFeedbackNode.connect(this.delayNode);
			currentNode = this.delayNode;
		}

		// Connect reverb if enabled (dry/wet mix)
		if (this.reverbNode && this.dryGainNode && this.wetGainNode) {
			// Dry signal
			currentNode.connect(this.dryGainNode);
			this.dryGainNode.connect(this.gainNode);

			// Wet signal
			currentNode.connect(this.reverbNode);
			this.reverbNode.connect(this.wetGainNode);
			this.wetGainNode.connect(this.gainNode);
		} else {
			currentNode.connect(this.gainNode);
		}

		// Connect to output destination
		if (this.outputDestination) {
			this.gainNode.connect(this.outputDestination);
		}
	}

	private disconnectAll(): void {
		try {
			this.sourceNode?.disconnect();
			this.lowEqNode.disconnect();
			this.midEqNode.disconnect();
			this.highEqNode.disconnect();
			this.compressorNode?.disconnect();
			this.delayNode?.disconnect();
			this.delayFeedbackNode?.disconnect();
			this.reverbNode?.disconnect();
			this.dryGainNode?.disconnect();
			this.wetGainNode?.disconnect();
			this.gainNode.disconnect();
		} finally {
			// Already disconnected
		}
	}

	setVolume(volume: number): void {
		this.gainNode.gain.value = volume;
	}

	connect(destination: AudioNode): void {
		this.outputDestination = destination;
		this.gainNode.connect(destination);
	}

	disconnect(): void {
		this.disconnectAll();
		this.outputDestination = null;
	}

	destroy(): void {
		this.disconnectAll();
		this.sourceNode = null;
		this.compressorNode = null;
		this.delayNode = null;
		this.delayFeedbackNode = null;
		this.reverbNode = null;
		this.dryGainNode = null;
		this.wetGainNode = null;
		this.outputDestination = null;
	}
}
