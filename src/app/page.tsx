"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoPreset } from "@/lib/shared/presets";
import { createProjectId } from "@/lib/utils/id";

const skeletonBaseClasses = "bg-arcumark-skeleton bg-[length:160%_100%] animate-arcumark-skeleton";

function PresetSkeleton(props: { keyIndex: number }) {
	return (
		<label
			className={`block cursor-pointer border-2 bg-neutral-800 p-3 transition hover:border-blue-500 ${
				props.keyIndex === 0 ? "border-blue-500" : "border-neutral-800"
			}`}
		>
			<div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-200">
				<input
					type="radio"
					name="preset"
					className="accent-blue-500"
					defaultChecked={props.keyIndex === 0}
				/>
				<div className="h-5 w-32 animate-pulse bg-neutral-700 text-sm" />
			</div>
			<div className="h-4 w-36 animate-pulse bg-neutral-700 text-sm" />
		</label>
	);
}

export default function Home() {
	const router = useRouter();
	const [presets, setPresets] = useState<VideoPreset[]>([]);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		setLoading(true);
		fetch("/api/presets")
			.then((res) => res.json() as Promise<VideoPreset[]>)
			.then((data) => {
				if (!active) return;
				setPresets(data);
				setSelectedPresetId(data[0]?.id ?? null);
			})
			.catch(() => {
				if (!active) return;
				setError("Failed to load presets");
			})
			.finally(() => {
				if (!active) return;
				setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	const selectedPreset = useMemo(
		() => presets.find((p) => p.id === selectedPresetId) ?? null,
		[presets, selectedPresetId]
	);

	const handleNewProject = () => {
		const id = createProjectId();
		if (selectedPreset) {
			try {
				localStorage.setItem("arcumark:lastPreset", selectedPreset.id);
			} catch (e) {
				console.error(e);
			}
			router.push(`/editor/${id}?preset=${selectedPreset.id}`);
		} else {
			router.push(`/editor/${id}`);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-50">
			<div className="grid w-full max-w-3xl gap-6 border border-neutral-800 bg-neutral-900 p-8">
				<div className="space-y-2">
					<div className="text-3xl font-bold">Arcumark</div>
					<div className="text-base text-neutral-400">
						Crafting visual traces and impressions in the browser.
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<button
						onClick={handleNewProject}
						disabled={loading}
						className="flex cursor-pointer items-center gap-2 border border-blue-700 bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
					>
						New Project
					</button>
					{loading ? (
						<div className={`h-4 w-40 ${skeletonBaseClasses}`} />
					) : selectedPreset ? (
						<div className="text-sm text-neutral-200">Using preset: {selectedPreset.name}</div>
					) : (
						<div className="h-5 w-52 animate-pulse bg-neutral-700 text-sm" />
					)}
				</div>
				<div className="space-y-2">
					<div className="text-base font-semibold">Presets</div>
					{error && <div className="text-sm text-red-400">{error}</div>}
					{presets.length === 0 ? (
						<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3" aria-label="Loading presets">
							{Array.from({ length: 3 }).map((_, index) => (
								<PresetSkeleton key={index} keyIndex={index} />
							))}
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
							{presets.map((preset) => (
								<label
									key={preset.id}
									className={`block cursor-pointer border-2 bg-neutral-800 p-3 transition hover:border-blue-500 ${
										selectedPresetId === preset.id ? "border-blue-500" : "border-neutral-800"
									}`}
								>
									<div className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-200">
										<input
											type="radio"
											name="preset"
											value={preset.id}
											checked={selectedPresetId === preset.id}
											onChange={() => setSelectedPresetId(preset.id)}
											className="accent-blue-500"
										/>
										<span>{preset.name}</span>
									</div>
									<div className="text-xs text-neutral-400">
										{preset.width}x{preset.height} • {preset.fps}fps • {preset.aspectRatioLabel}
									</div>
								</label>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
