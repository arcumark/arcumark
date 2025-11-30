import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Editor",
	description: "Editor for Arcumark",
};

export default function EditorLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return children;
}
