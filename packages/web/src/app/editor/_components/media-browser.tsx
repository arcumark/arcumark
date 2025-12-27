"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MediaItem = {
	id: string;
	name: string;
	durationLabel: string;
	durationSeconds: number;
	type: "video" | "audio" | "image";
	icon: ReactNode;
	url?: string;
};

type FilterKind = "all" | "video" | "audio" | "images";

type Props = {
	items: MediaItem[];
	onImport: (files: FileList) => void;
};

export const MEDIA_DRAG_TYPE = "application/x-arcumark-media-id";

export function MediaBrowser({ items, onImport }: Props) {
	const [viewMode, setViewMode] = useState<"list" | "gallery" | "icon">("list");
	const [sections, setSections] = useState<Record<FilterKind, boolean>>({
		all: true,
		video: true,
		audio: true,
		images: true,
	});
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const grouped = useMemo(() => {
		const byCategory: Record<FilterKind, MediaItem[]> = {
			all: items,
			video: items.filter((i) => i.type === "video"),
			audio: items.filter((i) => i.type === "audio"),
			images: items.filter((i) => i.type === "image"),
		};
		return byCategory;
	}, [items]);

	return (
		<div className="flex h-full flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-2 border-b px-3 py-2">
				<Button variant="outline" onClick={() => fileInputRef.current?.click()}>
					Import
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(e) => e.target.files && onImport(e.target.files)}
				/>
				<div className="ml-auto flex gap-1">
					{(["list", "gallery", "icon"] as const).map((mode) => (
						<Button
							key={mode}
							variant={viewMode === mode ? "default" : "ghost"}
							size="xs"
							onClick={() => setViewMode(mode)}
							aria-label={`View as ${mode}`}
						>
							{mode === "list" ? "List" : mode === "gallery" ? "Grid" : "Icon"}
						</Button>
					))}
				</div>
			</div>
			<div className="bg-card grid flex-1 gap-3 overflow-auto p-3">
				<div
					className="hover:border-primary border-muted bg-background flex w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed py-3 text-xs transition"
					onClick={() => fileInputRef.current?.click()}
				>
					<UploadIcon className="size-4" />
					Drop files or click to import
				</div>
				{(["all", "video", "audio", "images"] as FilterKind[]).map((category) => {
					const isOpen = sections[category];
					const itemsForSection = grouped[category];
					return (
						<div key={category} className="border-border bg-background border">
							<button
								className="flex w-full items-center justify-between px-3 py-2 text-left text-xs"
								onClick={() => setSections((prev) => ({ ...prev, [category]: !prev[category] }))}
							>
								<span className="flex items-center gap-2">
									<span>{isOpen ? "▾" : "▸"}</span>
									{category.charAt(0).toUpperCase() + category.slice(1)}
								</span>
								<span>{itemsForSection.length}</span>
							</button>
							{isOpen && (
								<div className="border-border border-t p-2">
									{itemsForSection.length === 0 ? (
										<div className="text-center text-xs">No items.</div>
									) : viewMode === "list" ? (
										itemsForSection.map((item) => (
											<div
												key={item.id}
												className="border-border bg-background mb-2 grid grid-cols-[56px_1fr] items-center gap-2 border p-2 last:mb-0"
												draggable
												onDragStart={(e) => {
													e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
													e.dataTransfer.effectAllowed = "copy";
												}}
											>
												<div className="border-border bg-card flex h-12 w-14 items-center justify-center border">
													{item.icon}
												</div>
												<div className="flex min-w-0 flex-col gap-1 text-xs">
													<div className="flex items-center justify-between gap-2">
														<div className="truncate font-semibold">{item.name}</div>
														<div className="flex-none">{item.durationLabel}</div>
													</div>
													<div>Type: {item.type}</div>
												</div>
											</div>
										))
									) : viewMode === "gallery" ? (
										<div className="grid grid-cols-2 gap-2">
											{itemsForSection.map((item) => (
												<div
													key={item.id}
													className="border-border bg-background flex flex-col gap-2 border p-2 text-xs"
													draggable
													onDragStart={(e) => {
														e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
														e.dataTransfer.effectAllowed = "copy";
													}}
												>
													<div className="border-border bg-card flex h-24 items-center justify-center border">
														{item.icon}
													</div>
													<div className="flex items-center justify-between font-semibold">
														<span className="truncate">{item.name}</span>
														<span>{item.durationLabel}</span>
													</div>
													<div>Type: {item.type}</div>
												</div>
											))}
										</div>
									) : (
										<div className="grid grid-cols-4 gap-2">
											{itemsForSection.map((item) => (
												<div
													key={item.id}
													className="border-border bg-background flex flex-col items-center gap-1 border p-2 text-xs"
													draggable
													onDragStart={(e) => {
														e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
														e.dataTransfer.effectAllowed = "copy";
													}}
												>
													<div className="border-border bg-card flex h-12 w-12 items-center justify-center overflow-hidden border">
														<span className="truncate">{item.icon}</span>
													</div>
													<div className="w-full truncate text-center">{item.name}</div>
													<div className="w-full truncate text-center">{item.durationLabel}</div>
												</div>
											))}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
