/**
 * Motion graphics templates
 */

export interface MotionTemplate {
	id: string;
	name: string;
	description: string;
	category: "text" | "shape" | "combined";
	props: Record<string, unknown>;
	keyframes?: {
		properties: Array<{
			property: string;
			keyframes: Array<{
				time: number;
				value: number;
				easing: string;
			}>;
		}>;
	};
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
	{
		id: "fade-in-slide-up",
		name: "Fade In & Slide Up",
		description: "Text fades in while sliding up",
		category: "text",
		props: {
			textAnimationType: "slideInUp",
			textAnimationDuration: 1,
		},
	},
	{
		id: "bounce-in",
		name: "Bounce In",
		description: "Text bounces in with scale animation",
		category: "text",
		props: {
			textAnimationType: "bounceIn",
			textAnimationDuration: 1.5,
		},
	},
	{
		id: "typewriter",
		name: "Typewriter",
		description: "Text appears character by character",
		category: "text",
		props: {
			textAnimationType: "typewriter",
			textAnimationDuration: 2,
		},
	},
	{
		id: "slide-in-left",
		name: "Slide In (Left)",
		description: "Text slides in from the left",
		category: "text",
		props: {
			textAnimationType: "slideInLeft",
			textAnimationDuration: 1,
		},
	},
	{
		id: "scale-in",
		name: "Scale In",
		description: "Text scales in from center",
		category: "text",
		props: {
			textAnimationType: "scaleIn",
			textAnimationDuration: 1,
		},
	},
	{
		id: "shape-fade-in",
		name: "Shape Fade In",
		description: "Shape fades in with opacity animation",
		category: "shape",
		props: {},
		keyframes: {
			properties: [
				{
					property: "opacity",
					keyframes: [
						{ time: 0, value: 0, easing: "linear" },
						{ time: 1, value: 100, easing: "easeOut" },
					],
				},
			],
		},
	},
	{
		id: "shape-scale-in",
		name: "Shape Scale In",
		description: "Shape scales in from center",
		category: "shape",
		props: {},
		keyframes: {
			properties: [
				{
					property: "scale",
					keyframes: [
						{ time: 0, value: 0, easing: "easeOut" },
						{ time: 1, value: 100, easing: "easeOut" },
					],
				},
				{
					property: "opacity",
					keyframes: [
						{ time: 0, value: 0, easing: "linear" },
						{ time: 1, value: 100, easing: "linear" },
					],
				},
			],
		},
	},
	{
		id: "shape-rotate-in",
		name: "Shape Rotate In",
		description: "Shape rotates in while fading",
		category: "shape",
		props: {},
		keyframes: {
			properties: [
				{
					property: "rotation",
					keyframes: [
						{ time: 0, value: -180, easing: "easeOut" },
						{ time: 1, value: 0, easing: "easeOut" },
					],
				},
				{
					property: "opacity",
					keyframes: [
						{ time: 0, value: 0, easing: "linear" },
						{ time: 1, value: 100, easing: "linear" },
					],
				},
			],
		},
	},
];

export function applyMotionTemplate(
	template: MotionTemplate,
	clipProps: Record<string, unknown>
): Record<string, unknown> {
	const newProps = { ...clipProps };

	// Apply template props
	Object.assign(newProps, template.props);

	// Apply keyframes if present
	if (template.keyframes) {
		newProps.keyframes = template.keyframes;
	}

	return newProps;
}
