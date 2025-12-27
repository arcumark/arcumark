import { NextResponse } from "next/server";
import { validateTimeline } from "@arcumark/shared";

export async function POST(request: Request) {
	const body = await request.json().catch(() => undefined);
	const result = validateTimeline(body);
	if (!result.ok) {
		return NextResponse.json({ ok: false, errors: result.errors }, { status: 400 });
	}
	return NextResponse.json({ ok: true });
}
