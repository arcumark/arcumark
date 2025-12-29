"use client";

import { useEffect, useMemo, useState } from "react";
import { Clip, Track } from "@arcumark/shared";
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
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ColorWheel } from "./color-wheel";
import { CurvesEditor } from "./curves-editor";
import { LevelsEditor } from "./levels-editor";
import type {
	ColorWheelAdjustment,
	ColorCurves,
	LevelsAdjustment,
	WhiteBalance,
} from "@/lib/color/color-correction";

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
				<div className="bg-card grid flex-1 gap-3 overflow-auto p-3">
					<div className="text-center text-xs">No clip selected</div>
				</div>
			</div>
		);
	}

	const opacityValue =
		typeof clip.props?.opacity === "number" ? (clip.props.opacity as number) : 100;
	const volumeValue = typeof clip.props?.volume === "number" ? (clip.props.volume as number) : 100;

	// Video transform properties
	const txValue = typeof clip.props?.tx === "number" ? (clip.props.tx as number) : 0;
	const tyValue = typeof clip.props?.ty === "number" ? (clip.props.ty as number) : 0;
	const scaleValue = typeof clip.props?.scale === "number" ? (clip.props.scale as number) : 1;

	// Text properties
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
			<div className="bg-card grid flex-1 gap-3 overflow-auto p-3">
				<Label className="text-xs font-semibold">Clip</Label>
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
				<Label className="text-xs font-semibold">Timing</Label>
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
				<Label className="text-xs font-semibold">Look & Sound</Label>
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

				{/* Transitions Section */}
				<Label className="text-xs font-semibold">Transitions</Label>
				<div className="grid grid-cols-2 gap-3">
					<div className="grid gap-2">
						<Label>Fade In (s)</Label>
						<Input
							type="number"
							min={0}
							max={10}
							step={0.1}
							value={(clip.props?.fadeIn as number) || 0}
							onChange={(e) =>
								onChange({
									props: { ...clip.props, fadeIn: parseFloat(e.target.value) || 0 },
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Fade Out (s)</Label>
						<Input
							type="number"
							min={0}
							max={10}
							step={0.1}
							value={(clip.props?.fadeOut as number) || 0}
							onChange={(e) =>
								onChange({
									props: { ...clip.props, fadeOut: parseFloat(e.target.value) || 0 },
								})
							}
						/>
					</div>
				</div>
				<div className="grid gap-2">
					<Label>Wipe Direction</Label>
					<Select
						value={(clip.props?.wipeDirection as string) || "none"}
						onValueChange={(value) =>
							onChange({
								props: { ...clip.props, wipeDirection: value === "none" ? null : value },
							})
						}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">None</SelectItem>
							<SelectItem value="left">Left</SelectItem>
							<SelectItem value="right">Right</SelectItem>
							<SelectItem value="up">Up</SelectItem>
							<SelectItem value="down">Down</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="grid gap-2">
						<Label>Wipe In (s)</Label>
						<Input
							type="number"
							min={0}
							max={10}
							step={0.1}
							value={(clip.props?.wipeIn as number) || 0}
							onChange={(e) =>
								onChange({
									props: { ...clip.props, wipeIn: parseFloat(e.target.value) || 0 },
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Wipe Out (s)</Label>
						<Input
							type="number"
							min={0}
							max={10}
							step={0.1}
							value={(clip.props?.wipeOut as number) || 0}
							onChange={(e) =>
								onChange({
									props: { ...clip.props, wipeOut: parseFloat(e.target.value) || 0 },
								})
							}
						/>
					</div>
				</div>

				{/* Effects Section */}
				<Label className="text-xs font-semibold">Effects</Label>
				<div className="grid gap-2">
					<div className="grid gap-2">
						<Label>Brightness ({((clip.props?.brightness as number) || 0).toFixed(0)})</Label>
						<Slider
							min={-100}
							max={100}
							step={1}
							value={[(clip.props?.brightness as number) || 0]}
							onValueChange={(values) =>
								onChange({
									props: { ...clip.props, brightness: Array.isArray(values) ? values[0] : values },
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Contrast ({((clip.props?.contrast as number) || 0).toFixed(0)})</Label>
						<Slider
							min={-100}
							max={100}
							step={1}
							value={[(clip.props?.contrast as number) || 0]}
							onValueChange={(values) =>
								onChange({
									props: { ...clip.props, contrast: Array.isArray(values) ? values[0] : values },
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Saturation ({((clip.props?.saturation as number) || 0).toFixed(0)})</Label>
						<Slider
							min={-100}
							max={100}
							step={1}
							value={[(clip.props?.saturation as number) || 0]}
							onValueChange={(values) =>
								onChange({
									props: { ...clip.props, saturation: Array.isArray(values) ? values[0] : values },
								})
							}
						/>
					</div>
					<div className="grid gap-2">
						<Label>Blur ({((clip.props?.blur as number) || 0).toFixed(1)}px)</Label>
						<Slider
							min={0}
							max={20}
							step={0.5}
							value={[(clip.props?.blur as number) || 0]}
							onValueChange={(values) =>
								onChange({
									props: { ...clip.props, blur: Array.isArray(values) ? values[0] : values },
								})
							}
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() =>
							onChange({
								props: {
									...clip.props,
									brightness: 0,
									contrast: 0,
									saturation: 0,
									blur: 0,
								},
							})
						}
					>
						Reset Effects
					</Button>
				</div>

				{/* Color Correction Section */}
				{clipKind === "video" && (
					<>
						<Label className="text-xs font-semibold">Color Correction</Label>

						{/* Color Wheel */}
						<div className="grid gap-2">
							<Label>Color Wheel</Label>
							<ColorWheel
								value={
									(clip.props?.colorWheel as ColorWheelAdjustment) || {
										hue: 0,
										saturation: 0,
										lightness: 0,
									}
								}
								onChange={(colorWheel) =>
									onChange({
										props: { ...clip.props, colorWheel },
									})
								}
							/>
						</div>

						{/* Curves */}
						<div className="grid gap-2">
							<Label>Curves</Label>
							<CurvesEditor
								value={
									(clip.props?.curves as ColorCurves) || {
										master: [],
										red: [],
										green: [],
										blue: [],
									}
								}
								onChange={(curves) =>
									onChange({
										props: { ...clip.props, curves },
									})
								}
							/>
						</div>

						{/* Levels */}
						<div className="grid gap-2">
							<Label>Levels</Label>
							<LevelsEditor
								value={
									(clip.props?.levels as LevelsAdjustment) || {
										inputBlack: 0,
										inputWhite: 255,
										outputBlack: 0,
										outputWhite: 255,
										gamma: 1.0,
									}
								}
								histogramData={null}
								onChange={(levels) =>
									onChange({
										props: { ...clip.props, levels },
									})
								}
							/>
						</div>

						{/* White Balance */}
						<div className="grid gap-2">
							<Label>White Balance</Label>
							<div className="grid gap-2">
								<div className="grid gap-2">
									<Label>
										Temperature (
										{((clip.props?.whiteBalance as WhiteBalance)?.temperature || 6500).toFixed(0)}{" "}
										K)
									</Label>
									<Slider
										min={2000}
										max={8000}
										step={100}
										value={[(clip.props?.whiteBalance as WhiteBalance)?.temperature || 6500]}
										onValueChange={(values) => {
											const wb = (clip.props?.whiteBalance as WhiteBalance) || {
												temperature: 6500,
												tint: 0,
											};
											onChange({
												props: {
													...clip.props,
													whiteBalance: {
														...wb,
														temperature: Array.isArray(values) ? values[0] : values,
													},
												},
											});
										}}
									/>
								</div>
								<div className="grid gap-2">
									<Label>
										Tint ({((clip.props?.whiteBalance as WhiteBalance)?.tint || 0).toFixed(0)})
									</Label>
									<Slider
										min={-150}
										max={150}
										step={1}
										value={[(clip.props?.whiteBalance as WhiteBalance)?.tint || 0]}
										onValueChange={(values) => {
											const wb = (clip.props?.whiteBalance as WhiteBalance) || {
												temperature: 6500,
												tint: 0,
											};
											onChange({
												props: {
													...clip.props,
													whiteBalance: {
														...wb,
														tint: Array.isArray(values) ? values[0] : values,
													},
												},
											});
										}}
									/>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										onChange({
											props: {
												...clip.props,
												whiteBalance: { temperature: 6500, tint: 0 },
											},
										})
									}
								>
									Reset White Balance
								</Button>
							</div>
						</div>

						{/* LUT */}
						<div className="grid gap-2">
							<Label>LUT (Lookup Table)</Label>
							<input
								type="file"
								accept=".cube,.png,.jpg,.jpeg"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) {
										const url = URL.createObjectURL(file);
										onChange({
											props: { ...clip.props, lutUrl: url },
										});
									}
								}}
								className="text-xs"
							/>
							{(clip.props?.lutUrl as string) && (
								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										const url = clip.props?.lutUrl as string;
										if (url) {
											URL.revokeObjectURL(url);
										}
										onChange({
											props: { ...clip.props, lutUrl: undefined },
										});
									}}
								>
									Remove LUT
								</Button>
							)}
						</div>

						{/* Reset All Color Correction */}
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								onChange({
									props: {
										...clip.props,
										colorWheel: undefined,
										curves: undefined,
										levels: undefined,
										whiteBalance: undefined,
										lutUrl: undefined,
									},
								})
							}
						>
							Reset All Color Correction
						</Button>
					</>
				)}

				{/* Audio Equalizer Section */}
				{clipKind === "audio" && (
					<>
						<Label className="text-xs font-semibold">Equalizer</Label>
						<div className="grid gap-2">
							<div className="grid gap-2">
								<Label>Low ({((clip.props?.eqLow as number) || 0).toFixed(1)} dB)</Label>
								<Slider
									min={-12}
									max={12}
									step={0.5}
									value={[(clip.props?.eqLow as number) || 0]}
									onValueChange={(values) =>
										onChange({
											props: { ...clip.props, eqLow: Array.isArray(values) ? values[0] : values },
										})
									}
								/>
							</div>

							<div className="grid gap-2">
								<Label>Mid ({((clip.props?.eqMid as number) || 0).toFixed(1)} dB)</Label>
								<Slider
									min={-12}
									max={12}
									step={0.5}
									value={[(clip.props?.eqMid as number) || 0]}
									onValueChange={(values) =>
										onChange({
											props: { ...clip.props, eqMid: Array.isArray(values) ? values[0] : values },
										})
									}
								/>
							</div>

							<div className="grid gap-2">
								<Label>High ({((clip.props?.eqHigh as number) || 0).toFixed(1)} dB)</Label>
								<Slider
									min={-12}
									max={12}
									step={0.5}
									value={[(clip.props?.eqHigh as number) || 0]}
									onValueChange={(values) =>
										onChange({
											props: { ...clip.props, eqHigh: Array.isArray(values) ? values[0] : values },
										})
									}
								/>
							</div>

							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									onChange({
										props: { ...clip.props, eqLow: 0, eqMid: 0, eqHigh: 0 },
									})
								}
							>
								Reset EQ
							</Button>
						</div>

						{/* Audio Effects Section */}
						<Label className="text-xs font-semibold">Audio Effects</Label>
						<div className="grid gap-3">
							{/* Compressor */}
							<div className="grid gap-2">
								<div className="flex items-center gap-2">
									<Checkbox
										checked={(clip.props?.compressorEnabled as boolean) || false}
										onCheckedChange={(checked) =>
											onChange({
												props: { ...clip.props, compressorEnabled: !!checked },
											})
										}
									/>
									<Label>Compressor</Label>
								</div>
								{(clip.props?.compressorEnabled as boolean) && (
									<>
										<div className="grid gap-2 pl-6">
											<Label>
												Threshold ({((clip.props?.compressorThreshold as number) || -24).toFixed(0)}{" "}
												dB)
											</Label>
											<Slider
												min={-100}
												max={0}
												step={1}
												value={[(clip.props?.compressorThreshold as number) || -24]}
												onValueChange={(values) =>
													onChange({
														props: {
															...clip.props,
															compressorThreshold: Array.isArray(values) ? values[0] : values,
														},
													})
												}
											/>
										</div>
										<div className="grid gap-2 pl-6">
											<Label>
												Ratio ({((clip.props?.compressorRatio as number) || 12).toFixed(1)}:1)
											</Label>
											<Slider
												min={1}
												max={20}
												step={0.5}
												value={[(clip.props?.compressorRatio as number) || 12]}
												onValueChange={(values) =>
													onChange({
														props: {
															...clip.props,
															compressorRatio: Array.isArray(values) ? values[0] : values,
														},
													})
												}
											/>
										</div>
									</>
								)}
							</div>

							{/* Delay / Echo */}
							<div className="grid gap-2">
								<div className="flex items-center gap-2">
									<Checkbox
										checked={(clip.props?.delayEnabled as boolean) || false}
										onCheckedChange={(checked) =>
											onChange({
												props: { ...clip.props, delayEnabled: !!checked },
											})
										}
									/>
									<Label>Delay / Echo</Label>
								</div>
								{(clip.props?.delayEnabled as boolean) && (
									<>
										<div className="grid gap-2 pl-6">
											<Label>
												Time ({((clip.props?.delayTime as number) || 0.5).toFixed(2)} s)
											</Label>
											<Slider
												min={0}
												max={2}
												step={0.01}
												value={[(clip.props?.delayTime as number) || 0.5]}
												onValueChange={(values) =>
													onChange({
														props: {
															...clip.props,
															delayTime: Array.isArray(values) ? values[0] : values,
														},
													})
												}
											/>
										</div>
										<div className="grid gap-2 pl-6">
											<Label>
												Feedback ({((clip.props?.delayFeedback as number) || 0.4).toFixed(2)})
											</Label>
											<Slider
												min={0}
												max={0.9}
												step={0.01}
												value={[(clip.props?.delayFeedback as number) || 0.4]}
												onValueChange={(values) =>
													onChange({
														props: {
															...clip.props,
															delayFeedback: Array.isArray(values) ? values[0] : values,
														},
													})
												}
											/>
										</div>
									</>
								)}
							</div>

							{/* Reverb */}
							<div className="grid gap-2">
								<div className="flex items-center gap-2">
									<Checkbox
										checked={(clip.props?.reverbEnabled as boolean) || false}
										onCheckedChange={(checked) =>
											onChange({
												props: { ...clip.props, reverbEnabled: !!checked },
											})
										}
									/>
									<Label>Reverb</Label>
								</div>
								{(clip.props?.reverbEnabled as boolean) && (
									<>
										<div className="grid gap-2 pl-6">
											<Label>Room Type</Label>
											<Select
												value={(clip.props?.reverbType as string) || "medium"}
												onValueChange={(value) =>
													onChange({
														props: { ...clip.props, reverbType: value },
													})
												}
											>
												<SelectTrigger>
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="small">Small Room</SelectItem>
													<SelectItem value="medium">Medium Room</SelectItem>
													<SelectItem value="large">Large Hall</SelectItem>
													<SelectItem value="hall">Concert Hall</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="grid gap-2 pl-6">
											<Label>Mix ({((clip.props?.reverbMix as number) || 0.3).toFixed(2)})</Label>
											<Slider
												min={0}
												max={1}
												step={0.01}
												value={[(clip.props?.reverbMix as number) || 0.3]}
												onValueChange={(values) =>
													onChange({
														props: {
															...clip.props,
															reverbMix: Array.isArray(values) ? values[0] : values,
														},
													})
												}
											/>
										</div>
									</>
								)}
							</div>
						</div>

						{/* Normalization Section */}
						<Label className="text-xs font-semibold">Normalization</Label>
						<div className="grid gap-2">
							<div className="flex items-center gap-2">
								<Checkbox
									checked={(clip.props?.normalizeEnabled as boolean) || false}
									onCheckedChange={(checked) =>
										onChange({
											props: { ...clip.props, normalizeEnabled: !!checked },
										})
									}
								/>
								<Label>Auto-normalize volume</Label>
							</div>

							{(clip.props?.normalizeEnabled as boolean) && (
								<div className="grid gap-2 pl-6">
									<Label>
										Target Level ({((clip.props?.normalizeTarget as number) || -1).toFixed(1)} dB)
									</Label>
									<Slider
										min={-3}
										max={0}
										step={0.1}
										value={[(clip.props?.normalizeTarget as number) || -1]}
										onValueChange={(values) =>
											onChange({
												props: {
													...clip.props,
													normalizeTarget: Array.isArray(values) ? values[0] : values,
												},
											})
										}
									/>
								</div>
							)}
						</div>
					</>
				)}

				{clipKind === "video" && (
					<>
						<Label className="text-xs font-semibold">Speed & Timing</Label>
						<div className="grid gap-2">
							<div className="grid gap-2">
								<Label>
									Playback Speed ({((clip.props?.playbackSpeed as number) || 1.0).toFixed(2)}x)
								</Label>
								<Slider
									min={0.25}
									max={4}
									step={0.25}
									value={[(clip.props?.playbackSpeed as number) || 1.0]}
									onValueChange={(values) =>
										onChange({
											props: {
												...clip.props,
												playbackSpeed: Array.isArray(values) ? values[0] : values,
											},
										})
									}
								/>
							</div>

							{/* Quick speed preset buttons */}
							<div className="grid grid-cols-5 gap-1">
								{[0.25, 0.5, 1, 2, 4].map((speed) => (
									<Button
										key={speed}
										variant="outline"
										size="sm"
										onClick={() => onChange({ props: { ...clip.props, playbackSpeed: speed } })}
									>
										{speed}x
									</Button>
								))}
							</div>
						</div>
					</>
				)}

				{clipKind === "video" && (
					<>
						<Label className="text-xs font-semibold">Transform</Label>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-2">
								<Label>Position X (px)</Label>
								<Input
									type="number"
									step="1"
									value={txValue}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												tx: parseFloat(e.target.value) || 0,
											},
										})
									}
								/>
							</div>
							<div className="grid gap-2">
								<Label>Position Y (px)</Label>
								<Input
									type="number"
									step="1"
									value={tyValue}
									onChange={(e) =>
										onChange({
											props: {
												...clip.props,
												ty: parseFloat(e.target.value) || 0,
											},
										})
									}
								/>
							</div>
						</div>
						<div className="grid gap-2">
							<Label>Scale</Label>
							<Input
								type="number"
								min={0.1}
								max={5}
								step={0.1}
								value={scaleValue}
								onChange={(e) =>
									onChange({
										props: {
											...clip.props,
											scale: Math.min(5, Math.max(0.1, parseFloat(e.target.value) || 1)),
										},
									})
								}
							/>
						</div>
						<div className="grid gap-2">
							<Button
								variant="outline"
								onClick={() =>
									onChange({
										props: {
											...clip.props,
											tx: 0,
											ty: 0,
											scale: 1,
										},
									})
								}
							>
								Reset Transform
							</Button>
						</div>
					</>
				)}
				{clipKind === "text" && (
					<>
						<Label className="text-xs font-semibold">Text</Label>
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
