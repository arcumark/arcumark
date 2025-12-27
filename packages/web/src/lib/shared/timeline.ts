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

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function validateTimeline(value: unknown): TimelineValidationResult {
	const errors: string[] = [];
	if (!isObject(value)) {
		return { ok: false, errors: ["Timeline must be an object"] };
	}

	const { id, name, duration, tracks } = value;

	if (typeof id !== "string" || id.length === 0) {
		errors.push("Timeline id must be a non-empty string");
	}

	if (typeof name !== "string" || name.length === 0) {
		errors.push("Timeline name must be a non-empty string");
	}

	if (typeof duration !== "number" || Number.isNaN(duration)) {
		errors.push("Timeline duration must be a number");
	} else if (duration < 0) {
		errors.push("Timeline duration must be >= 0");
	}

	if (!Array.isArray(tracks)) {
		errors.push("Timeline tracks must be an array");
	}

	const timeline: Timeline = {
		id: typeof id === "string" ? id : "",
		name: typeof name === "string" ? name : "",
		duration: typeof duration === "number" && !Number.isNaN(duration) ? duration : 0,
		tracks: Array.isArray(tracks) ? [] : [],
	};

	if (Array.isArray(tracks)) {
		tracks.forEach((track, trackIndex) => {
			if (!isObject(track)) {
				errors.push(`Track ${trackIndex} must be an object`);
				return;
			}

			const { id: trackId, kind, clips } = track;
			if (typeof trackId !== "string" || trackId.length === 0) {
				errors.push(`Track ${trackIndex} id must be a non-empty string`);
			}
			if (kind !== "video" && kind !== "audio" && kind !== "text") {
				errors.push(`Track ${trackIndex} kind must be one of video, audio, text`);
			}
			if (!Array.isArray(clips)) {
				errors.push(`Track ${trackIndex} clips must be an array`);
			}

			const parsedClips: Clip[] = [];
			if (Array.isArray(clips)) {
				clips.forEach((clip, clipIndex) => {
					if (!isObject(clip)) {
						errors.push(`Clip ${clipIndex} in track ${trackIndex} must be an object`);
						return;
					}

					const { id: clipId, start, end, sourceId, props } = clip;
					if (typeof clipId !== "string" || clipId.length === 0) {
						errors.push(`Clip ${clipIndex} in track ${trackIndex} id must be a non-empty string`);
					}
					if (typeof start !== "number" || Number.isNaN(start) || start < 0) {
						errors.push(`Clip ${clipIndex} in track ${trackIndex} start must be >= 0`);
					}
					if (
						typeof end !== "number" ||
						Number.isNaN(end) ||
						end <= (typeof start === "number" ? start : 0)
					) {
						errors.push(`Clip ${clipIndex} in track ${trackIndex} end must be greater than start`);
					}
					if (
						typeof end === "number" &&
						typeof duration === "number" &&
						!Number.isNaN(end) &&
						!Number.isNaN(duration)
					) {
						if (duration >= 0 && end > duration) {
							errors.push(
								`Clip ${clipIndex} in track ${trackIndex} end must be <= timeline duration`
							);
						}
					}
					if (typeof sourceId !== "string" || sourceId.length === 0) {
						errors.push(
							`Clip ${clipIndex} in track ${trackIndex} sourceId must be a non-empty string`
						);
					}
					if (props !== undefined && !isObject(props)) {
						errors.push(
							`Clip ${clipIndex} in track ${trackIndex} props must be an object if provided`
						);
					}

					parsedClips.push({
						id: typeof clipId === "string" ? clipId : "",
						start: typeof start === "number" && !Number.isNaN(start) ? start : 0,
						end: typeof end === "number" && !Number.isNaN(end) ? end : 0,
						sourceId: typeof sourceId === "string" ? sourceId : "",
						props: isObject(props) ? props : undefined,
					});
				});
			}

			timeline.tracks.push({
				id: typeof trackId === "string" ? trackId : "",
				kind: kind === "video" || kind === "audio" || kind === "text" ? kind : "video",
				clips: parsedClips,
			});
		});
	}

	if (errors.length > 0) {
		return { ok: false, errors };
	}

	return { ok: true, timeline };
}
