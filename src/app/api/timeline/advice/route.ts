import { NextResponse } from "next/server";
import { validateTimeline } from "@/lib/shared/timeline";

export async function POST(request: Request) {
	const body = await request.json().catch(() => undefined);
	const validation = validateTimeline(body);
	if (!validation.ok) {
		return NextResponse.json({ ok: false, errors: validation.errors }, { status: 400 });
	}

	const timeline = validation.timeline;
	const advices: string[] = [];
	const allClips = timeline.tracks.flatMap((track) => track.clips);

	if (timeline.duration > 120 && allClips.length < 3) {
		advices.push("Timeline is long but contains few clips; consider trimming or adding content.");
	}

	const shortClips = allClips.filter((clip) => clip.end - clip.start < 1);
	if (shortClips.length >= 3) {
		advices.push("There are many very short clips; check pacing and consider combining them.");
	}

	timeline.tracks.forEach((track) => {
		const sorted = [...track.clips].sort((a, b) => a.start - b.start);
		for (let i = 0; i < sorted.length - 1; i += 1) {
			const gap = sorted[i + 1].start - sorted[i].end;
			if (gap > 5) {
				advices.push(
					`Track ${track.id} has a gap of ${gap.toFixed(1)}s; consider filling or closing it.`
				);
				break;
			}
		}
	});

	if (advices.length === 0) {
		advices.push("Timeline looks balanced. No immediate issues detected.");
	}

	return NextResponse.json({ ok: true, advices });
}
