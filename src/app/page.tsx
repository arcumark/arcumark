"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoPreset } from "@/lib/shared/presets";
import { createProjectId } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

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
			router.push(`/editor?id=${id}&preset=${selectedPreset.id}`);
		} else {
			router.push(`/editor?id=${id}`);
		}
	};

	return (
		<PageShell
			title="Arcumark"
			description="Crafting visual traces and impressions in the browser."
		>
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						onClick={handleNewProject}
						disabled={loading || presets.length === 0}
						variant="default"
					>
						New Project
					</Button>
					<Button onClick={() => router.push("/projects")} variant="outline">
						View Projects
					</Button>
				</div>
				{loading ? (
					<Skeleton className="h-4 w-44" />
				) : selectedPreset && selectedPreset.name !== "" ? (
					<FieldDescription>Using preset: {selectedPreset.name}</FieldDescription>
				) : (
					<Skeleton className="h-4 w-44" />
				)}
			</div>
			<Field>
				<FieldLabel>Presets</FieldLabel>
				{error && <FieldDescription className="text-red-400">{error}</FieldDescription>}
				{presets.length === 0 ? (
					<RadioGroup
						value={selectedPresetId ?? ""}
						onValueChange={(value) => setSelectedPresetId(value as string)}
						className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
					>
						{Array.from({ length: 3 }).map((_, index) => (
							<FieldLabel key={index} htmlFor={`preset-${index}`} className="cursor-pointer">
								<Field orientation="horizontal">
									<RadioGroupItem value={`preset-${index}`} id={`preset-${index}`} />
									<FieldContent>
										<Skeleton className="h-[16.5px] w-30" />
										<Skeleton className="h-4.5 w-36" />
									</FieldContent>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>
				) : (
					<RadioGroup
						value={selectedPresetId ?? ""}
						onValueChange={(value) => setSelectedPresetId(value as string)}
						className="grid gap-3 sm:grid-cols-2 md:grid-cols-3"
					>
						{presets.map((preset) => (
							<FieldLabel key={preset.id} htmlFor={preset.id} className="cursor-pointer">
								<Field orientation="horizontal">
									<RadioGroupItem value={preset.id} id={preset.id} />
									<FieldContent>
										<div className="font-medium">{preset.name}</div>
										<FieldDescription>
											{preset.width}x{preset.height} • {preset.fps}fps • {preset.aspectRatioLabel}
										</FieldDescription>
									</FieldContent>
								</Field>
							</FieldLabel>
						))}
					</RadioGroup>
				)}
			</Field>
		</PageShell>
	);
}
