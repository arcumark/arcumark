"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SkipBack, Play, Pause, Square, SkipForward, Repeat } from "lucide-react";

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
		<div className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3">
			<Label>Arcumark</Label>
			<Label className="font-mono">{projectName}</Label>
			<Button variant="default" onClick={onExport}>
				Export
			</Button>
			<div className="flex-1" />
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					onClick={onStep.bind(null, -1)}
					aria-label="Step backward"
				>
					<SkipBack />
				</Button>
				<Button
					variant={isPlaying ? "default" : "outline"}
					size="icon"
					onClick={onPlayToggle}
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? <Pause /> : <Play />}
				</Button>
				<Button variant="outline" size="icon" onClick={onStop} aria-label="Stop">
					<Square />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={onStep.bind(null, 1)}
					aria-label="Step forward"
				>
					<SkipForward />
				</Button>
				<Button
					variant={loop ? "default" : "outline"}
					size="icon"
					onClick={onLoopToggle}
					aria-label="Loop toggle"
				>
					<Repeat />
				</Button>
			</div>
			<Input
				className="focus-visible:border-border w-fit cursor-default font-mono select-none focus-visible:ring-0 focus-visible:ring-offset-0"
				value={timecode}
				readOnly
				tabIndex={-1}
			/>
		</div>
	);
}
