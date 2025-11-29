"use client";

type Props = {
	projectName: string;
	isPlaying: boolean;
	loop: boolean;
	timecode: string;
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
	onPlayToggle,
	onStop,
	onStep,
	onLoopToggle,
}: Props) {
	return (
		<div className="flex h-12 items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-3 text-neutral-100">
			<div className="text-base font-bold text-white">Arcumark</div>
			<div className="text-sm text-neutral-300">{projectName}</div>
			<div className="flex-1" />
			<div className="flex items-center gap-2">
				<button
					className="border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-100 transition hover:bg-neutral-700"
					onClick={onStep.bind(null, -1)}
					aria-label="Step backward"
				>
					◀
				</button>
				<button
					className={`border px-3 py-1 text-xs transition ${isPlaying ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
					onClick={onPlayToggle}
					aria-label="Play or pause"
				>
					{isPlaying ? "Pause" : "Play"}
				</button>
				<button
					className="border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-100 transition hover:bg-neutral-700"
					onClick={onStop}
					aria-label="Stop"
				>
					Stop
				</button>
				<button
					className="border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs text-neutral-100 transition hover:bg-neutral-700"
					onClick={onStep.bind(null, 1)}
					aria-label="Step forward"
				>
					▶
				</button>
				<button
					className={`border px-3 py-1 text-xs transition ${loop ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
					onClick={onLoopToggle}
					aria-label="Loop toggle"
				>
					Loop
				</button>
			</div>
			<div className="border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm text-slate-200">
				{timecode}
			</div>
		</div>
	);
}
