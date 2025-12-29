"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	SkipBack,
	Play,
	Pause,
	Square,
	SkipForward,
	Repeat,
	Undo2,
	Redo2,
	History,
	Save,
	AlertCircle,
} from "lucide-react";

type Props = {
	projectName: string;
	isPlaying: boolean;
	loop: boolean;
	timecode: string;
	saveStatus?: "saved" | "saving" | "unsaved";
	canUndo?: boolean;
	canRedo?: boolean;
	versions?: Array<{ id: string; timestamp: number; description?: string }>;
	onExport: () => void;
	onPlayToggle: () => void;
	onStop: () => void;
	onStep: (delta: number) => void;
	onLoopToggle: () => void;
	onFrameStep?: (frames: number) => void; // Frame-by-frame stepping
	onUndo?: () => void;
	onRedo?: () => void;
	onSaveVersion?: () => void;
	onRestoreVersion?: (versionId: string) => void;
	fps?: number; // FPS for frame duration calculation
};

export function TopBar({
	projectName,
	isPlaying,
	loop,
	timecode,
	saveStatus = "saved",
	canUndo = false,
	canRedo = false,
	versions = [],
	onExport,
	onPlayToggle,
	onStop,
	onStep,
	onLoopToggle,
	onFrameStep,
	onUndo,
	onRedo,
	onSaveVersion,
	onRestoreVersion,
}: Props) {
	return (
		<div className="border-border bg-card flex h-12 items-center gap-3 border-b px-3">
			<Label>Arcumark</Label>
			<Label className="font-mono">{projectName}</Label>
			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon"
					onClick={onUndo}
					disabled={!canUndo}
					title="Undo (Ctrl+Z)"
					className="h-8 w-8"
				>
					<Undo2 className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={onRedo}
					disabled={!canRedo}
					title="Redo (Ctrl+Shift+Z)"
					className="h-8 w-8"
				>
					<Redo2 className="h-4 w-4" />
				</Button>
			</div>
			<div className="flex items-center gap-1">
				{saveStatus === "saved" && (
					<div className="text-muted-foreground flex items-center gap-1 text-xs" title="Saved">
						<Save className="h-3 w-3" />
					</div>
				)}
				{saveStatus === "saving" && (
					<div className="text-muted-foreground flex items-center gap-1 text-xs" title="Saving...">
						<Save className="h-3 w-3 animate-pulse" />
					</div>
				)}
				{saveStatus === "unsaved" && (
					<div className="text-destructive flex items-center gap-1 text-xs" title="Save failed">
						<AlertCircle className="h-3 w-3" />
					</div>
				)}
			</div>
			{onSaveVersion && (
				<Button variant="outline" size="sm" onClick={onSaveVersion} title="Save version">
					<History className="mr-1 h-4 w-4" />
					Save Version
				</Button>
			)}
			{versions.length > 0 && onRestoreVersion && (
				<Select
					value=""
					onValueChange={(value) => {
						if (value) onRestoreVersion(value);
					}}
				>
					<SelectTrigger className="h-8 w-[180px] text-xs">
						<SelectValue>
							<span className="text-muted-foreground">Restore version...</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{versions.map((version) => (
							<SelectItem key={version.id} value={version.id}>
								{new Date(version.timestamp).toLocaleString()}
								{version.description && ` - ${version.description}`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
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
				{onFrameStep && (
					<div className="ml-2 flex items-center gap-1 border-l pl-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onFrameStep(-1)}
							aria-label="Step back 1 frame"
							title="Previous frame (,)"
						>
							-1F
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onFrameStep(1)}
							aria-label="Step forward 1 frame"
							title="Next frame (.)"
						>
							+1F
						</Button>
					</div>
				)}
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
