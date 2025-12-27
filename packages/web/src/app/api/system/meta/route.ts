import { NextResponse } from "next/server";

export function GET() {
	return NextResponse.json({
		name: "Arcumark",
		version: "0.1.0",
	});
}
