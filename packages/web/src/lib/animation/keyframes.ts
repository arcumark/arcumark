/**
 * Keyframe animation utilities for video editing
 */

export type EasingFunction =
	| "linear"
	| "easeIn"
	| "easeOut"
	| "easeInOut"
	| "easeInQuad"
	| "easeOutQuad"
	| "easeInOutQuad"
	| "easeInCubic"
	| "easeOutCubic"
	| "easeInOutCubic"
	| "easeInQuart"
	| "easeOutQuart"
	| "easeInOutQuart"
	| "easeInExpo"
	| "easeOutExpo"
	| "easeInOutExpo"
	| "easeInBack"
	| "easeOutBack"
	| "easeInOutBack"
	| "easeInElastic"
	| "easeOutElastic"
	| "easeInOutElastic"
	| "bounceIn"
	| "bounceOut"
	| "bounceInOut";

export type Keyframe<T = number> = {
	time: number; // Relative time from clip start (0 ~ clip.duration) in seconds
	value: T;
	easing?: EasingFunction; // Default: 'linear'
};

export type PropertyKeyframes = {
	property: string; // e.g., 'tx', 'ty', 'scale', 'rotation', 'opacity', 'x', 'y'
	keyframes: Keyframe[];
};

export type ClipKeyframes = {
	properties: PropertyKeyframes[];
};

/**
 * Apply easing function to a normalized time value (0 to 1)
 */
export function applyEasing(t: number, easing: EasingFunction = "linear"): number {
	const clampedT = Math.max(0, Math.min(1, t));

	switch (easing) {
		case "linear":
			return clampedT;
		case "easeIn":
			return clampedT * clampedT;
		case "easeOut":
			return 1 - (1 - clampedT) * (1 - clampedT);
		case "easeInOut":
			return clampedT < 0.5 ? 2 * clampedT * clampedT : 1 - Math.pow(-2 * clampedT + 2, 2) / 2;
		case "easeInQuad":
			return clampedT * clampedT;
		case "easeOutQuad":
			return 1 - (1 - clampedT) * (1 - clampedT);
		case "easeInOutQuad":
			return clampedT < 0.5 ? 2 * clampedT * clampedT : 1 - Math.pow(-2 * clampedT + 2, 2) / 2;
		case "easeInCubic":
			return clampedT * clampedT * clampedT;
		case "easeOutCubic":
			return 1 - Math.pow(1 - clampedT, 3);
		case "easeInOutCubic":
			return clampedT < 0.5
				? 4 * clampedT * clampedT * clampedT
				: 1 - Math.pow(-2 * clampedT + 2, 3) / 2;
		case "easeInQuart":
			return clampedT * clampedT * clampedT * clampedT;
		case "easeOutQuart":
			return 1 - Math.pow(1 - clampedT, 4);
		case "easeInOutQuart":
			return clampedT < 0.5
				? 8 * clampedT * clampedT * clampedT * clampedT
				: 1 - Math.pow(-2 * clampedT + 2, 4) / 2;
		case "easeInExpo":
			return clampedT === 0 ? 0 : Math.pow(2, 10 * (clampedT - 1));
		case "easeOutExpo":
			return clampedT === 1 ? 1 : 1 - Math.pow(2, -10 * clampedT);
		case "easeInOutExpo":
			return clampedT === 0
				? 0
				: clampedT === 1
					? 1
					: clampedT < 0.5
						? Math.pow(2, 20 * clampedT - 10) / 2
						: (2 - Math.pow(2, -20 * clampedT + 10)) / 2;
		case "easeInBack":
			return 2.70158 * clampedT * clampedT * clampedT - 1.70158 * clampedT * clampedT;
		case "easeOutBack": {
			const c1 = 1.70158;
			const c3 = c1 + 1;
			return 1 + c3 * Math.pow(clampedT - 1, 3) + c1 * Math.pow(clampedT - 1, 2);
		}
		case "easeInOutBack": {
			const c1 = 1.70158;
			const c2 = c1 * 1.525;
			return clampedT < 0.5
				? (Math.pow(2 * clampedT, 2) * ((c2 + 1) * 2 * clampedT - c2)) / 2
				: (Math.pow(2 * clampedT - 2, 2) * ((c2 + 1) * (clampedT * 2 - 2) + c2) + 2) / 2;
		}
		case "easeInElastic":
			return clampedT === 0
				? 0
				: clampedT === 1
					? 1
					: -Math.pow(2, 10 * (clampedT - 1)) * Math.sin((clampedT - 1.1) * 5 * Math.PI);
		case "easeOutElastic":
			return clampedT === 0
				? 0
				: clampedT === 1
					? 1
					: Math.pow(2, -10 * clampedT) * Math.sin((clampedT - 0.1) * 5 * Math.PI) + 1;
		case "easeInOutElastic":
			return clampedT === 0
				? 0
				: clampedT === 1
					? 1
					: clampedT < 0.5
						? -(
								Math.pow(2, 20 * clampedT - 10) *
								Math.sin(((20 * clampedT - 11.125) * (2 * Math.PI)) / 4.5)
							) / 2
						: (Math.pow(2, -20 * clampedT + 10) *
								Math.sin(((20 * clampedT - 11.125) * (2 * Math.PI)) / 4.5)) /
								2 +
							1;
		case "bounceIn":
			return 1 - bounceOut(1 - clampedT);
		case "bounceOut":
			return bounceOut(clampedT);
		case "bounceInOut":
			return clampedT < 0.5
				? (1 - bounceOut(1 - 2 * clampedT)) / 2
				: (1 + bounceOut(2 * clampedT - 1)) / 2;
		default:
			return clampedT;
	}
}

function bounceOut(t: number): number {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) {
		return n1 * t * t;
	} else if (t < 2 / d1) {
		return n1 * (t -= 1.5 / d1) * t + 0.75;
	} else if (t < 2.5 / d1) {
		return n1 * (t -= 2.25 / d1) * t + 0.9375;
	} else {
		return n1 * (t -= 2.625 / d1) * t + 0.984375;
	}
}

/**
 * Interpolate between two values
 */
function interpolate(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

/**
 * Get animated value at a specific time for a property
 */
export function getAnimatedValue(
	keyframes: Keyframe[],
	time: number,
	defaultValue: number = 0
): number {
	if (keyframes.length === 0) return defaultValue;

	// Sort keyframes by time
	const sorted = [...keyframes].sort((a, b) => a.time - b.time);

	// If before first keyframe, return first value
	if (time <= sorted[0].time) {
		return sorted[0].value;
	}

	// If after last keyframe, return last value
	if (time >= sorted[sorted.length - 1].time) {
		return sorted[sorted.length - 1].value;
	}

	// Find the two keyframes to interpolate between
	for (let i = 0; i < sorted.length - 1; i++) {
		const kf1 = sorted[i];
		const kf2 = sorted[i + 1];

		if (time >= kf1.time && time <= kf2.time) {
			const duration = kf2.time - kf1.time;
			if (duration === 0) return kf1.value;

			const localTime = (time - kf1.time) / duration;
			const easing = kf2.easing || "linear";
			const easedT = applyEasing(localTime, easing);

			return interpolate(kf1.value, kf2.value, easedT);
		}
	}

	return defaultValue;
}

/**
 * Get all animated properties at a specific time
 */
export function getAnimatedProperties(
	keyframes: ClipKeyframes,
	time: number,
	defaultProps: Record<string, number> = {}
): Record<string, number> {
	const result: Record<string, number> = { ...defaultProps };

	for (const propKeyframes of keyframes.properties) {
		const defaultValue = defaultProps[propKeyframes.property] ?? 0;
		result[propKeyframes.property] = getAnimatedValue(propKeyframes.keyframes, time, defaultValue);
	}

	return result;
}

/**
 * Get all keyframe times for a clip (for timeline visualization)
 */
export function getAllKeyframeTimes(keyframes: ClipKeyframes): number[] {
	const times = new Set<number>();
	for (const propKeyframes of keyframes.properties) {
		for (const kf of propKeyframes.keyframes) {
			times.add(kf.time);
		}
	}
	return Array.from(times).sort((a, b) => a - b);
}
