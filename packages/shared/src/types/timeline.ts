export type Clip = {
	id: string;
	start: number;
	end: number;
	sourceId: string;
	props?: Record<string, unknown>;
};

export type Track = {
	id: string;
	kind: "video" | "audio" | "text";
	clips: Clip[];
};

export type Timeline = {
	id: string;
	name: string;
	duration: number;
	tracks: Track[];
};

export type TimelineValidationResult =
	| { ok: true; timeline: Timeline }
	| { ok: false; errors: string[] };
