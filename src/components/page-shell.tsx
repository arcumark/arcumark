"use client";

import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PageShellProps = {
	title: string;
	description?: string;
	maxWidth?: string;
	children: ReactNode;
};

export function PageShell({
	title,
	description,
	maxWidth = "max-w-2xl",
	children,
}: PageShellProps) {
	return (
		<div className="flex min-h-screen items-center justify-center px-6 py-12">
			<Card className={`w-full ${maxWidth}`}>
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent className="grid gap-6">{children}</CardContent>
			</Card>
		</div>
	);
}
