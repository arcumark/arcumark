"use client";

import { useRouter } from "next/navigation";
import { createProjectId } from "@/lib/utils/id";

export default function EditorIndexPage() {
	const router = useRouter();

	const handleNew = () => {
		const id = createProjectId();
		router.push(`/editor/${id}`);
	};

	return (
		<div
			style={{
				minHeight: "100vh",
				background: "#0f0f0f",
				color: "#e5e5e5",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: "32px",
			}}
		>
			<div
				style={{
					border: "1px solid #2f2f2f",
					background: "#151515",
					padding: "24px",
					width: "420px",
					display: "grid",
					gap: "12px",
				}}
			>
				<div style={{ fontSize: "20px", fontWeight: 700 }}>Arcumark Editor</div>
				<div style={{ fontSize: "14px", color: "#b5b5b5" }}>
					Select or create a project ID to open the editor.
				</div>
				<button
					style={{
						padding: "10px 14px",
						background: "#3b82f6",
						color: "#0d1117",
						border: "1px solid #2d63b3",
						cursor: "pointer",
						fontWeight: 600,
						borderRadius: "0",
					}}
					onClick={handleNew}
				>
					Create new project
				</button>
			</div>
		</div>
	);
}
