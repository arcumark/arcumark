"use client";

import { useMemo } from "react";
import { Clip } from "@/lib/shared/timeline";

type Props = {
	clip: Clip | null;
	onChange: (changes: Partial<Clip>) => void;
};

export function Inspector({ clip, onChange }: Props) {
	const displayName = useMemo(() => {
		if (!clip) return "";
		const maybeName =
			clip.props && typeof clip.props["name"] === "string" ? (clip.props["name"] as string) : "";
		return maybeName || clip.id;
	}, [clip]);

	if (!clip) {
		return (
			<div className="flex h-full flex-col">
				<div className="grid flex-1 gap-3 overflow-auto bg-neutral-900 p-3 text-sm text-neutral-400">
					<div className="text-center text-neutral-500">No clip selected</div>
				</div>
			</div>
		);
	}

	const opacityValue =
		typeof clip.props?.opacity === "number" ? (clip.props.opacity as number) : 100;
	const volumeValue = typeof clip.props?.volume === "number" ? (clip.props.volume as number) : 100;

	return (
		<div className="flex h-full flex-col">
			<div className="grid flex-1 gap-3 overflow-auto bg-neutral-900 p-3">
				<div className="text-sm font-semibold text-neutral-200">Clip</div>
				<div className="grid gap-2">
					<label className="text-xs text-neutral-400">Name</label>
					<input
						className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
						value={displayName}
						onChange={(e) =>
							onChange({
								props: { ...clip.props, name: e.target.value },
							})
						}
					/>
				</div>
				<div className="grid gap-2">
					<label className="text-xs text-neutral-400">Source ID</label>
					<input
						className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
						value={clip.sourceId}
						readOnly
					/>
				</div>
				<div className="text-sm font-semibold text-neutral-200">Timing</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="grid gap-2">
						<label className="text-xs text-neutral-400">Start (s)</label>
						<input
							className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
							type="number"
							step="0.1"
							value={clip.start}
							onChange={(e) => onChange({ start: Math.max(0, parseFloat(e.target.value) || 0) })}
						/>
					</div>
					<div className="grid gap-2">
						<label className="text-xs text-neutral-400">End (s)</label>
						<input
							className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
							type="number"
							step="0.1"
							value={clip.end}
							onChange={(e) => onChange({ end: Math.max(0, parseFloat(e.target.value) || 0) })}
						/>
					</div>
				</div>
				<div className="text-sm font-semibold text-neutral-200">Look & Sound</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="grid gap-2">
						<label className="text-xs text-neutral-400">Opacity</label>
						<input
							className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
							type="number"
							min={0}
							max={100}
							value={opacityValue}
							onChange={(e) =>
								onChange({
									props: {
										...clip.props,
										opacity: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
									},
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<label className="text-xs text-neutral-400">Volume</label>
						<input
							className="border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-50"
							type="number"
							min={0}
							max={100}
							value={volumeValue}
							onChange={(e) =>
								onChange({
									props: {
										...clip.props,
										volume: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
									},
								})
							}
						/>
					</div>
				</div>
				<div className="grid gap-2">
					<button
						className="border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-50 transition hover:bg-neutral-700"
						onClick={() => onChange({ start: 0 })}
					>
						Reset Start
					</button>
				</div>
			</div>
		</div>
	);
}
