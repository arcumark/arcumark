"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { KeyframeEditor } from "./keyframe-editor";
import type { ClipKeyframes, PropertyKeyframes, EasingFunction } from "@/lib/animation/keyframes";

type Props = {
	value: ClipKeyframes;
	clipDuration: number;
	clipProps?: Record<string, unknown>;
	supportedProperties?: string[];
	onChange: (value: ClipKeyframes) => void;
};

const PROPERTY_OPTIONS = [
	{ value: "tx", label: "Position X", defaultValue: 0 },
	{ value: "ty", label: "Position Y", defaultValue: 0 },
	{ value: "scale", label: "Scale", defaultValue: 1 },
	{ value: "rotation", label: "Rotation", defaultValue: 0 },
	{ value: "opacity", label: "Opacity", defaultValue: 100 },
	{ value: "x", label: "Text X (%)", defaultValue: 50 },
	{ value: "y", label: "Text Y (%)", defaultValue: 50 },
	{ value: "brightness", label: "Brightness", defaultValue: 0 },
	{ value: "contrast", label: "Contrast", defaultValue: 0 },
	{ value: "saturation", label: "Saturation", defaultValue: 0 },
];

export function KeyframesManager({
	value,
	clipDuration,
	clipProps = {},
	supportedProperties,
	onChange,
}: Props) {
	const [selectedProperty, setSelectedProperty] = useState<string>("tx");

	// Get available properties based on supportedProperties
	const availablePropertyOptions = supportedProperties
		? PROPERTY_OPTIONS.filter((opt) => supportedProperties.includes(opt.value))
		: PROPERTY_OPTIONS;

	// Set initial selected property to first available
	const initialProperty = availablePropertyOptions[0]?.value || "tx";
	if (
		selectedProperty !== initialProperty &&
		!availablePropertyOptions.some((opt) => opt.value === selectedProperty)
	) {
		setSelectedProperty(initialProperty);
	}

	const handleAddProperty = () => {
		// Check if property already exists
		if (value.properties.some((p) => p.property === selectedProperty)) {
			return;
		}

		// Get current property value or default
		const propertyOption = PROPERTY_OPTIONS.find((opt) => opt.value === selectedProperty);
		const defaultValue = propertyOption?.defaultValue ?? 0;

		// Try to get current value from clip props
		let currentValue = defaultValue;
		if (clipProps && typeof clipProps[selectedProperty] === "number") {
			currentValue = clipProps[selectedProperty] as number;
		}

		const newProperty: PropertyKeyframes = {
			property: selectedProperty,
			keyframes: [
				{ time: 0, value: currentValue, easing: "linear" as EasingFunction },
				{ time: clipDuration, value: currentValue, easing: "linear" as EasingFunction },
			],
		};

		onChange({
			properties: [...value.properties, newProperty],
		});
	};

	const handlePropertyChange = (index: number, newProperty: PropertyKeyframes) => {
		const properties = [...value.properties];
		properties[index] = newProperty;
		onChange({ properties });
	};

	const handlePropertyDelete = (index: number) => {
		const properties = value.properties.filter((_, i) => i !== index);
		onChange({ properties });
	};

	const availableProperties = availablePropertyOptions.filter(
		(opt) => !value.properties.some((p) => p.property === opt.value)
	);

	return (
		<div className="grid gap-3">
			<div className="flex items-center gap-2">
				<Select
					value={selectedProperty}
					onValueChange={(val) => {
						if (val) setSelectedProperty(val);
					}}
				>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{availablePropertyOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					variant="outline"
					size="sm"
					onClick={handleAddProperty}
					disabled={availableProperties.length === 0}
				>
					Add Property
				</Button>
			</div>

			{value.properties.length === 0 && (
				<div className="text-muted-foreground border-border border p-4 text-center text-xs">
					No animated properties. Select a property and click &ldquo;Add Property&rdquo; to start
					animating.
				</div>
			)}

			{value.properties.map((prop, index) => (
				<KeyframeEditor
					key={`${prop.property}-${index}`}
					value={prop}
					clipDuration={clipDuration}
					onChange={(newProp) => handlePropertyChange(index, newProp)}
					onDelete={() => handlePropertyDelete(index)}
				/>
			))}

			{value.properties.length > 0 && (
				<Button variant="outline" size="sm" onClick={() => onChange({ properties: [] })}>
					Clear All
				</Button>
			)}
		</div>
	);
}
