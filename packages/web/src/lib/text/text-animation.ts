/**
 * Text animation utilities
 */

export type TextAnimationType =
	| "none"
	| "fadeIn"
	| "slideInLeft"
	| "slideInRight"
	| "slideInUp"
	| "slideInDown"
	| "typewriter"
	| "scaleIn"
	| "bounceIn";

export interface TextAnimationProps {
	type?: TextAnimationType;
	duration?: number; // in seconds
}

/**
 * Apply text animation styles based on type and progress
 */
export function getTextAnimationStyles(
	type: TextAnimationType | undefined,
	progress: number
): React.CSSProperties {
	if (!type || type === "none" || progress >= 1) {
		return {};
	}

	const styles: React.CSSProperties = {};

	switch (type) {
		case "fadeIn":
			styles.opacity = progress;
			break;

		case "slideInLeft":
			styles.opacity = progress;
			styles.transform = `translateX(${(1 - progress) * -100}px)`;
			break;

		case "slideInRight":
			styles.opacity = progress;
			styles.transform = `translateX(${(1 - progress) * 100}px)`;
			break;

		case "slideInUp":
			styles.opacity = progress;
			styles.transform = `translateY(${(1 - progress) * -100}px)`;
			break;

		case "slideInDown":
			styles.opacity = progress;
			styles.transform = `translateY(${(1 - progress) * 100}px)`;
			break;

		case "typewriter":
			styles.opacity = 1;
			// Typewriter effect is handled by character count, not CSS
			break;

		case "scaleIn":
			styles.opacity = progress;
			styles.transform = `scale(${0.5 + progress * 0.5})`;
			break;

		case "bounceIn":
			styles.opacity = progress;
			if (progress < 1) {
				const bounce = 1 - Math.pow(1 - progress, 3);
				styles.transform = `scale(${bounce})`;
			}
			break;
	}

	return styles;
}

/**
 * Get visible text for typewriter effect
 */
export function getTypewriterText(
	fullText: string,
	progress: number,
	clipDuration: number,
	animationDuration: number
): string {
	if (!fullText) return "";
	const effectiveDuration = Math.min(animationDuration, clipDuration);
	const charsPerSecond = fullText.length / effectiveDuration;
	const visibleChars = Math.floor(progress * effectiveDuration * charsPerSecond);
	return fullText.slice(0, Math.min(visibleChars, fullText.length));
}
