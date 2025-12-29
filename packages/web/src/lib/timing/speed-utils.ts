/**
 * Speed and timing calculation utilities for video playback
 */

/**
 * Calculate source time with speed consideration
 * @param clipOffset - Elapsed time from clip start (on timeline)
 * @param clipProps - Clip properties including speed settings
 * @param sourceStart - Source offset (for trimming)
 * @returns Source time to display
 */
export function calculateSourceTime(
	clipOffset: number,
	clipProps: Record<string, unknown>,
	sourceStart: number
): number {
	const speed = typeof clipProps.playbackSpeed === "number" ? clipProps.playbackSpeed : 1.0;

	const reverse = clipProps.reversePlayback === true;

	if (reverse) {
		// Reverse playback: start from source end and go backward
		const sourceEnd = (clipProps.sourceEnd as number) ?? sourceStart;
		return sourceEnd - clipOffset * speed;
	}

	return sourceStart + clipOffset * speed;
}

/**
 * Get frame duration based on FPS
 * @param fps - Frames per second (default: 30)
 * @returns Duration of one frame in seconds
 */
export function getFrameDuration(fps: number = 30): number {
	return 1 / fps;
}

/**
 * Step playback position by frame count
 * @param currentTime - Current playback time
 * @param frameCount - Number of frames to step (positive or negative)
 * @param fps - Frames per second (default: 30)
 * @returns New playback time
 */
export function stepFrames(currentTime: number, frameCount: number, fps: number = 30): number {
	const frameDuration = getFrameDuration(fps);
	return currentTime + frameCount * frameDuration;
}
