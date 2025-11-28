import { NextResponse } from "next/server";
import { VIDEO_PRESETS } from "@/lib/shared/presets";

export function GET() {
	return NextResponse.json(VIDEO_PRESETS);
}
