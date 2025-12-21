"use client";

import { Button } from "@/components/ui/button";

type Props = {
	projectName: string;
	isPlaying: boolean;
	loop: boolean;
	timecode: string;
	onExport: () => void;
	onPlayToggle: () => void;
	onStop: () => void;
	onStep: (delta: number) => void;
	onLoopToggle: () => void;
};

export function TopBar({
	projectName,
	isPlaying,
	loop,
	timecode,
	onExport,
	onPlayToggle,
	onStop,
	onStep,
	onLoopToggle,
}: Props) {
	return (
		<div className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-100">
			<div className="text-base font-bold text-white">Arcumark</div>
			<div className="text-sm text-neutral-300">{projectName}</div>
			<Button variant="default" onClick={onExport}>
				Export
			</Button>
			<div className="flex-1" />
			<div className="flex items-center gap-2">
				<Button variant="outline" onClick={onStep.bind(null, -1)} aria-label="Step backward">
					◀
				</Button>
				<Button
					variant={isPlaying ? "default" : "outline"}
					onClick={onPlayToggle}
					aria-label="Play or pause"
				>
					{isPlaying ? "Pause" : "Play"}
				</Button>
				<Button variant="outline" onClick={onStop} aria-label="Stop">
					Stop
				</Button>
				<Button variant="outline" onClick={onStep.bind(null, 1)} aria-label="Step forward">
					▶
				</Button>
				<Button
					variant={loop ? "default" : "outline"}
					onClick={onLoopToggle}
					aria-label="Loop toggle"
				>
					Loop
				</Button>
			</div>
			<div className="border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm text-slate-200">
				{timecode}
			</div>
		</div>
	);
}
