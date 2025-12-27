import { NextResponse } from "next/server";
import { VIDEO_PRESETS } from "@arcumark/shared";

export function GET() {
	return NextResponse.json(VIDEO_PRESETS);
}
