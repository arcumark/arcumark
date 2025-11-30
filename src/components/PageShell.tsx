"use client";

import type { ReactNode } from "react";

type PageShellProps = {
	title: string;
	description?: string;
	maxWidth?: string;
	children: ReactNode;
};

export function PageShell({
	title,
	description,
	maxWidth = "max-w-3xl",
	children,
}: PageShellProps) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-50">
			<div className={`grid w-full ${maxWidth} gap-6 border border-neutral-800 bg-neutral-900 p-8`}>
				<div className="space-y-2">
					<div className="text-3xl font-bold">{title}</div>
					{description && <div className="text-base text-neutral-400">{description}</div>}
				</div>
				{children}
			</div>
		</div>
	);
}
