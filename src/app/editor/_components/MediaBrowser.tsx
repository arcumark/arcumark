"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { UploadIcon } from "lucide-react";

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
			<div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-2">
				<button
					className="border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-50 transition hover:bg-neutral-700"
					onClick={() => fileInputRef.current?.click()}
				>
					Import
				</button>
				<input
					ref={fileInputRef}
					type="file"
					multiple
					className="hidden"
					onChange={(e) => e.target.files && onImport(e.target.files)}
				/>
				<div className="ml-auto flex gap-1">
					{(["list", "gallery", "icon"] as const).map((mode) => (
						<button
							key={mode}
							className={`border px-2 py-1 text-[11px] transition ${viewMode === mode ? "border-blue-700 bg-blue-500 text-slate-950" : "border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"}`}
							onClick={() => setViewMode(mode)}
							aria-label={`View as ${mode}`}
						>
							{mode === "list" ? "List" : mode === "gallery" ? "Grid" : "Icon"}
						</button>
					))}
				</div>
			</div>
			<div className="grid flex-1 gap-3 overflow-auto bg-neutral-900 p-3">
				<div
					className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-neutral-700 bg-neutral-950 py-3 text-xs text-neutral-300 transition hover:border-blue-500 hover:text-neutral-50"
					onClick={() => fileInputRef.current?.click()}
				>
					<UploadIcon className="size-4" />
					Drop files or click to import
				</div>
				{(["all", "video", "audio", "images"] as FilterKind[]).map((category) => {
					const isOpen = sections[category];
					const itemsForSection = grouped[category];
					return (
						<div key={category} className="border border-neutral-800 bg-neutral-950">
							<button
								className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-100"
								onClick={() => setSections((prev) => ({ ...prev, [category]: !prev[category] }))}
							>
								<span className="flex items-center gap-2">
									<span className="text-xs text-neutral-400">{isOpen ? "▾" : "▸"}</span>
									{category.charAt(0).toUpperCase() + category.slice(1)}
								</span>
								<span className="text-xs text-neutral-400">{itemsForSection.length}</span>
							</button>
							{isOpen && (
								<div className="border-t border-neutral-800 p-2">
									{itemsForSection.length === 0 ? (
										<div className="text-center text-xs text-neutral-500">No items.</div>
									) : viewMode === "list" ? (
										itemsForSection.map((item) => (
											<div
												key={item.id}
												className="mb-2 grid grid-cols-[56px_1fr] items-center gap-2 border border-neutral-800 bg-neutral-950 p-2 text-sm text-neutral-50 last:mb-0"
												draggable
												onDragStart={(e) => {
													e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
													e.dataTransfer.effectAllowed = "copy";
												}}
											>
												<div className="flex h-12 w-14 items-center justify-center border border-neutral-800 bg-neutral-900 text-base text-neutral-300">
													{item.icon}
												</div>
												<div className="flex min-w-0 flex-col gap-1">
													<div className="flex items-center justify-between gap-2">
														<div className="truncate text-sm font-semibold text-neutral-100">
															{item.name}
														</div>
														<div className="flex-none text-xs text-neutral-400">
															{item.durationLabel}
														</div>
													</div>
													<div className="text-[11px] text-neutral-400">Type: {item.type}</div>
												</div>
											</div>
										))
									) : viewMode === "gallery" ? (
										<div className="grid grid-cols-2 gap-2">
											{itemsForSection.map((item) => (
												<div
													key={item.id}
													className="flex flex-col gap-2 border border-neutral-800 bg-neutral-950 p-2 text-sm text-neutral-50"
													draggable
													onDragStart={(e) => {
														e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
														e.dataTransfer.effectAllowed = "copy";
													}}
												>
													<div className="flex h-24 items-center justify-center border border-neutral-800 bg-neutral-900 text-lg text-neutral-300">
														{item.icon}
													</div>
													<div className="flex items-center justify-between text-sm font-semibold text-neutral-100">
														<span className="truncate">{item.name}</span>
														<span className="text-xs text-neutral-400">{item.durationLabel}</span>
													</div>
													<div className="text-[11px] text-neutral-400">Type: {item.type}</div>
												</div>
											))}
										</div>
									) : (
										<div className="grid grid-cols-4 gap-2">
											{itemsForSection.map((item) => (
												<div
													key={item.id}
													className="flex flex-col items-center gap-1 border border-neutral-800 bg-neutral-950 p-2 text-sm text-neutral-50"
													draggable
													onDragStart={(e) => {
														e.dataTransfer.setData(MEDIA_DRAG_TYPE, item.id);
														e.dataTransfer.effectAllowed = "copy";
													}}
												>
													<div className="flex h-12 w-12 items-center justify-center overflow-hidden border border-neutral-800 bg-neutral-900 text-lg text-neutral-300">
														<span className="truncate text-lg">{item.icon}</span>
													</div>
													<div className="w-full truncate text-center text-xs text-neutral-200">
														{item.name}
													</div>
													<div className="w-full truncate text-center text-[11px] text-neutral-400">
														{item.durationLabel}
													</div>
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
