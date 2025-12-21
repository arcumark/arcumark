"use client";

import { useEffect, useMemo, useState } from "react";
import { Clip, Track } from "@/lib/shared/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
	clip: Clip | null;
	clipKind: Track["kind"] | null;
	onChange: (changes: Partial<Clip>) => void;
};

const FALLBACK_FONTS = [
	"Inter",
	"Roboto",
	"Open Sans",
	"Montserrat",
	"Source Sans Pro",
	"Poppins",
	"Lato",
	"IBM Plex Sans",
	"Fira Sans",
	"Space Grotesk",
];

type LocalFontData = {
	family: string;
	fullName?: string;
	postscriptName?: string;
	style?: string;
};

export function Inspector({ clip, clipKind, onChange }: Props) {
	const [fontOptions, setFontOptions] = useState<string[]>(FALLBACK_FONTS);

	useEffect(() => {
		let cancelled = false;
		const loadFonts = async () => {
			try {
				const nav = navigator as Navigator & {
					fonts?: { queryLocalFonts?: () => Promise<LocalFontData[]> };
				};
				const supportsLocalFonts = typeof nav.fonts?.queryLocalFonts === "function";
				if (!supportsLocalFonts) return;
				const fonts: LocalFontData[] = await nav.fonts!.queryLocalFonts!();
				if (cancelled || !Array.isArray(fonts)) return;
				const names = Array.from(
					new Set(
						fonts
							.map((f) => f.fullName || f.family || f.postscriptName || "")
							.filter((n) => typeof n === "string" && n.trim().length > 0)
					)
				).slice(0, 80);
				if (names.length > 0) {
					setFontOptions((prev) => Array.from(new Set([...names, ...prev])));
				}
			} catch (e) {
				console.warn("Local font access unavailable", e);
			}
		};
		if (typeof window !== "undefined") {
			void loadFonts();
		}
		return () => {
			cancelled = true;
		};
	}, []);

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
	const textValue =
		typeof clip.props?.text === "string" && clip.props.text.length > 0
			? (clip.props.text as string)
			: "";
	const fontValue =
		typeof clip.props?.font === "string" && clip.props.font.length > 0
			? (clip.props.font as string)
			: (fontOptions[0] ?? "Inter");
	const sizeValue = typeof clip.props?.size === "number" ? (clip.props.size as number) : 24;
	const colorValue =
		typeof clip.props?.color === "string" && clip.props.color.length > 0
			? (clip.props.color as string)
			: "#ffffff";
	const strokeColor =
		typeof clip.props?.strokeColor === "string" && clip.props.strokeColor.length > 0
			? (clip.props.strokeColor as string)
			: "#000000";
	const strokeWidth =
		typeof clip.props?.strokeWidth === "number" ? (clip.props.strokeWidth as number) : 0;
	const posX = typeof clip.props?.x === "number" ? (clip.props.x as number) : 50;
	const posY = typeof clip.props?.y === "number" ? (clip.props.y as number) : 50;
	const rotation = typeof clip.props?.rotation === "number" ? (clip.props.rotation as number) : 0;
	const lineHeight =
		typeof clip.props?.lineHeight === "number" ? (clip.props.lineHeight as number) : 1.2;
	const letterSpacing =
		typeof clip.props?.letterSpacing === "number" ? (clip.props.letterSpacing as number) : 0;
	const textAlign =
		typeof clip.props?.align === "string" &&
		["left", "center", "right"].includes(clip.props.align as string)
			? (clip.props.align as string)
			: "center";
	const anchorX =
		typeof clip.props?.anchorX === "string" &&
		["left", "center", "right"].includes(clip.props.anchorX as string)
			? (clip.props.anchorX as "left" | "center" | "right")
			: "center";
	const anchorY =
		typeof clip.props?.anchorY === "string" &&
		["top", "center", "bottom"].includes(clip.props.anchorY as string)
			? (clip.props.anchorY as "top" | "center" | "bottom")
			: "center";

	return (
		<div className="flex h-full flex-col">
			<div className="grid flex-1 gap-3 overflow-auto bg-neutral-900 p-3">
				<div className="text-sm font-semibold text-neutral-200">Clip</div>
				<div className="grid gap-2">
					<Label>Name</Label>
					<Input
						value={displayName}
						onChange={(e) =>
							onChange({
								props: { ...clip.props, name: e.target.value },
							})
						}
					/>
				</div>
				<div className="grid gap-2">
					<Label>Source ID</Label>
					<Input value={clip.sourceId} readOnly />
				</div>
				<div className="text-sm font-semibold text-neutral-200">Timing</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="grid min-w-0 gap-2">
						<Label>Start (s)</Label>
						<Input
							type="number"
							step="0.1"
							value={clip.start}
							onChange={(e) => onChange({ start: Math.max(0, parseFloat(e.target.value) || 0) })}
						/>
					</div>
					<div className="grid min-w-0 gap-2">
						<Label>End (s)</Label>
						<Input
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
						<Label>Opacity</Label>
						<Input
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
					{clipKind !== "text" && (
						<div className="grid gap-2">
							<Label>Volume</Label>
							<Input
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
					)}
				</div>
				{clipKind === "text" && (
					<>
						<div className="text-sm font-semibold text-neutral-200">Text</div>
						<div className="grid gap-2">
							<Label>Content</Label>
							<Textarea
								className="min-h-[80px]"
								value={textValue}
								onChange={(e) =>
									onChange({
										props: { ...clip.props, text: e.target.value },
									})
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Font family</Label>
								<Select
									value={fontValue}
									onValueChange={(value) =>
										onChange({
											props: { ...clip.props, font: value },
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{fontOptions.map((font) => (
											<SelectItem key={font} value={font}>
												{font}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>Font size</Label>
								<Input
									type="number"
									min={8}
									max={200}
									value={sizeValue}
									onChange={(e) =>
										onChange({
											props: { ...clip.props, size: Math.max(8, parseFloat(e.target.value) || 8) },
										})
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Pos X (%)</Label>
								<Input
									type="number"
									min={0}
									max={100}
									value={posX}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												x: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
											},
										})
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Pos Y (%)</Label>
								<Input
									type="number"
									min={0}
									max={100}
									value={posY}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												y: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
											},
										})
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Anchor X</Label>
								<Select
									value={anchorX}
									onValueChange={(value) =>
										onChange({
											props: {
												...clip.props,
												anchorX: value as "left" | "center" | "right",
											},
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="left">Left</SelectItem>
										<SelectItem value="center">Center</SelectItem>
										<SelectItem value="right">Right</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid gap-2">
								<Label>Anchor Y</Label>
								<Select
									value={anchorY}
									onValueChange={(value) =>
										onChange({
											props: {
												...clip.props,
												anchorY: value as "top" | "center" | "bottom",
											},
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="top">Top</SelectItem>
										<SelectItem value="center">Center</SelectItem>
										<SelectItem value="bottom">Bottom</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Rotation (deg)</Label>
								<Input
									type="number"
									min={-360}
									max={360}
									value={rotation}
									onChange={(e) =>
										onChange({
											props: { ...clip.props, rotation: parseFloat(e.target.value) || 0 },
										})
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Align</Label>
								<Select
									value={textAlign}
									onValueChange={(value) =>
										onChange({
											props: { ...clip.props, align: value },
										})
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="left">Left</SelectItem>
										<SelectItem value="center">Center</SelectItem>
										<SelectItem value="right">Right</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Line spacing</Label>
								<Input
									type="number"
									min={0.5}
									max={3}
									step={0.1}
									value={lineHeight}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												lineHeight: Math.max(0.5, parseFloat(e.target.value) || 1),
											},
										})
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Letter spacing (px)</Label>
								<Input
									type="number"
									min={-10}
									max={50}
									step={0.5}
									value={letterSpacing}
									onChange={(e) =>
										onChange({
											props: { ...clip.props, letterSpacing: parseFloat(e.target.value) || 0 },
										})
									}
								/>
							</div>
						</div>
						<div className="grid gap-2">
							<Label>Color</Label>
							<Input
								className="h-9 w-full cursor-pointer px-2 py-1"
								type="color"
								value={colorValue}
								onChange={(e) =>
									onChange({
										props: { ...clip.props, color: e.target.value },
									})
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Stroke color</Label>
								<Input
									className="h-9 w-full cursor-pointer px-2 py-1"
									type="color"
									value={strokeColor}
									onChange={(e) =>
										onChange({
											props: { ...clip.props, strokeColor: e.target.value },
										})
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Stroke width</Label>
								<Input
									type="number"
									min={0}
									max={20}
									value={strokeWidth}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												strokeWidth: Math.min(20, Math.max(0, parseFloat(e.target.value) || 0)),
											},
										})
									}
								/>
							</div>
						</div>
					</>
				)}
				<div className="grid gap-2">
					<Button variant="outline" onClick={() => onChange({ start: 0 })}>
						Reset Start
					</Button>
				</div>
			</div>
		</div>
	);
}
