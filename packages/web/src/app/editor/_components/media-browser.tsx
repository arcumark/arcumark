"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { UploadIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

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
	onDelete?: (ids: string[]) => void;
};

export const MEDIA_DRAG_TYPE = "application/x-arcumark-media-id";

export function MediaBrowser({ items, onImport, onDelete }: Props) {
	const [viewMode, setViewMode] = useState<"list" | "gallery" | "icon">("list");
	const [sections, setSections] = useState<Record<FilterKind, boolean>>({
		all: true,
		video: true,
		audio: true,
		images: true,
	});
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const lastSelectedRef = useRef<string | null>(null);

	const grouped = useMemo(() => {
		const byCategory: Record<FilterKind, MediaItem[]> = {
			all: items,
			video: items.filter((i) => i.type === "video"),
			audio: items.filter((i) => i.type === "audio"),
			images: items.filter((i) => i.type === "image"),
		};
		return byCategory;
	}, [items]);

	const handleItemClick = (itemId: string, shiftKey: boolean, categoryItems: MediaItem[]) => {
		if (shiftKey && lastSelectedRef.current) {
			// Range selection with Shift key
			const lastIndex = categoryItems.findIndex((item) => item.id === lastSelectedRef.current);
			const currentIndex = categoryItems.findIndex((item) => item.id === itemId);
			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeIds = categoryItems.slice(start, end + 1).map((item) => item.id);
				setSelectedIds((prev) => {
					const next = new Set(prev);
					rangeIds.forEach((id) => next.add(id));
					return next;
				});
			}
		} else {
			// Single selection (clear previous selections)
			setSelectedIds(new Set([itemId]));
			lastSelectedRef.current = itemId;
		}
	};

	const handleDeleteClick = () => {
		if (selectedIds.size === 0 || !onDelete) return;
		setShowDeleteConfirm(true);
	};

	const handleConfirmDelete = () => {
		if (onDelete && selectedIds.size > 0) {
			onDelete(Array.from(selectedIds));
			setSelectedIds(new Set());
			lastSelectedRef.current = null;
		}
		setShowDeleteConfirm(false);
	};

	return (
		<div className="flex h-full flex-1 flex-col">
			<div className="border-border bg-card flex items-center gap-2 border-b px-3 py-2">
				<Button variant="outline" onClick={() => fileInputRef.current?.click()}>
					Import
				</Button>
				{onDelete && (
					<Button
						variant="outline"
						disabled={selectedIds.size === 0}
						onClick={handleDeleteClick}
						aria-label={`Delete ${selectedIds.size} selected items`}
					>
						<TrashIcon className="h-4 w-4" />
						{selectedIds.size > 0 && <span className="ml-1">({selectedIds.size})</span>}
					</Button>
				)}
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
										itemsForSection.map((item) => {
											const isSelected = selectedIds.has(item.id);
											return (
												<div
													key={item.id}
													className={`border-border mb-2 grid cursor-pointer grid-cols-[56px_1fr] items-center gap-2 border p-2 transition last:mb-0 ${
														isSelected
															? "bg-primary/20 border-primary"
															: "bg-background hover:bg-muted"
													}`}
													draggable
													onClick={(e) => handleItemClick(item.id, e.shiftKey, itemsForSection)}
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
											);
										})
									) : viewMode === "gallery" ? (
										<div className="grid grid-cols-2 gap-2">
											{itemsForSection.map((item) => {
												const isSelected = selectedIds.has(item.id);
												return (
													<div
														key={item.id}
														className={`border-border flex cursor-pointer flex-col gap-2 border p-2 text-xs transition ${
															isSelected
																? "bg-primary/20 border-primary"
																: "bg-background hover:bg-muted"
														}`}
														draggable
														onClick={(e) => handleItemClick(item.id, e.shiftKey, itemsForSection)}
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
												);
											})}
										</div>
									) : (
										<div className="grid grid-cols-4 gap-2">
											{itemsForSection.map((item) => {
												const isSelected = selectedIds.has(item.id);
												return (
													<div
														key={item.id}
														className={`border-border flex cursor-pointer flex-col items-center gap-1 border p-2 text-xs transition ${
															isSelected
																? "bg-primary/20 border-primary"
																: "bg-background hover:bg-muted"
														}`}
														draggable
														onClick={(e) => handleItemClick(item.id, e.shiftKey, itemsForSection)}
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
												);
											})}
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			<Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Media</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete {selectedIds.size} item
							{selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleConfirmDelete}>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
