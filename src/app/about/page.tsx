"use client";

import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
	FieldGroup,
} from "@/components/ui/field";

export default function AboutPage() {
	return (
		<PageShell
			title="About"
			description="A browser-based editor for visual traces and impressions."
		>
			<FieldGroup>
				<Field>
					<FieldContent>
						<span>
							Arcumark is a playground for assembling video, audio, and text directly in the
							browser. It focuses on a minimal, timeline-driven workflow that stays fast without
							native installs.
						</span>
						<span>
							Your projects are stored locally in your browser. Export presets help you target the
							exact aspect ratio and frame size you need, and the viewer reflects what will be
							rendered.
						</span>
					</FieldContent>
				</Field>
				<Field>
					<FieldLabel>Highlights</FieldLabel>
					<FieldContent>
						<ul className="list-disc space-y-1 pl-5">
							<li>Import media, arrange clips, and edit transforms, crops, and distortions.</li>
							<li>Text overlays with font, color, stroke, and positioning controls.</li>
							<li>Timeline snapping, copy/paste clips, and per-track organization.</li>
							<li>Export presets with aspect ratio preview and cut-off visualization.</li>
						</ul>
					</FieldContent>
				</Field>
				<Field>
					<FieldContent>
						<FieldDescription>
							Arcumark is MIT licensed. Feedback and contributions are welcome.
						</FieldDescription>
					</FieldContent>
				</Field>
				<Field>
					<FieldLabel>Explore</FieldLabel>
					<FieldContent>
						<ul className="list-disc space-y-1 pl-5">
							<li>
								<Link href="/license/third-party">View third-party licenses.</Link>
							</li>
							<li>
								<Link href="https://github.com/arcumark/arcumark">
									View the source code on GitHub.
								</Link>
							</li>
							<li>
								<Link href="https://github.com/minagishl">
									View the developer&apos;s profile on GitHub.
								</Link>
							</li>
							<li>
								<Link href="/license">View the license.</Link>
							</li>
						</ul>
					</FieldContent>
				</Field>
			</FieldGroup>
		</PageShell>
	);
}
