"use client";

import { PageShell } from "@/components/PageShell";

export default function AboutPage() {
	return (
		<PageShell
			title="About"
			description="A browser-based editor for visual traces and impressions."
		>
			<div className="grid gap-3 text-sm text-neutral-200">
				<p>
					Arcumark is a playground for assembling video, audio, and text directly in the browser. It
					focuses on a minimal, timeline-driven workflow that stays fast without native installs.
				</p>
				<p className="text-neutral-300">
					Your projects are stored locally in your browser. Export presets help you target the exact
					aspect ratio and frame size you need, and the viewer reflects what will be rendered.
				</p>
				<div className="space-y-1 text-neutral-300">
					<div className="font-semibold text-neutral-100">Highlights</div>
					<ul className="list-disc space-y-1 pl-5">
						<li>Import media, arrange clips, and edit transforms, crops, and distortions.</li>
						<li>Text overlays with font, color, stroke, and positioning controls.</li>
						<li>Timeline snapping, copy/paste clips, and per-track organization.</li>
						<li>Export presets with aspect ratio preview and cut-off visualization.</li>
					</ul>
				</div>
				<p className="text-neutral-400">
					Arcumark is MIT licensed. Feedback and contributions are welcome.
				</p>
				<div className="grid gap-2 border border-neutral-800 bg-neutral-900/80 p-4 text-xs text-neutral-300">
					<div className="text-neutral-200">Explore Arcumark</div>
					<ul className="grid gap-2 sm:grid-cols-2">
						<li>
							<a
								href="/license"
								className="flex items-center justify-between border border-neutral-800 bg-neutral-900 px-3 py-2 transition hover:border-blue-500 hover:text-neutral-100"
							>
								<span>License</span>
								<span className="text-[10px] text-neutral-500">MIT</span>
							</a>
						</li>
						<li>
							<a
								href="https://github.com/arcumark/arcumark"
								target="_blank"
								rel="noreferrer"
								className="flex items-center justify-between border border-neutral-800 bg-neutral-900 px-3 py-2 transition hover:border-blue-500 hover:text-neutral-100"
							>
								<span>GitHub Repository</span>
								<span className="text-[10px] text-neutral-500">arcumark/arcumark</span>
							</a>
						</li>
						<li className="sm:col-span-2">
							<a
								href="https://github.com/minagishl"
								target="_blank"
								rel="noreferrer"
								className="flex items-center justify-between border border-neutral-800 bg-neutral-900 px-3 py-2 transition hover:border-blue-500 hover:text-neutral-100"
							>
								<span>Developer</span>
								<span className="text-[10px] text-neutral-500">@minagishl</span>
							</a>
						</li>
					</ul>
				</div>
			</div>
		</PageShell>
	);
}
