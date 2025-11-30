"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { createProjectId } from "@/lib/utils/id";

export default function EditorIndexPage() {
	const router = useRouter();

	const handleNew = () => {
		const id = createProjectId();
		router.push(`/editor/${id}`);
	};

	return (
		<PageShell title="Editor" description="Select or create a project ID to open the editor.">
			<div className="flex flex-wrap items-center gap-3">
				<button
					className="flex cursor-pointer items-center gap-2 border border-blue-700 bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
					onClick={handleNew}
				>
					Create new project
				</button>
			</div>
		</PageShell>
	);
}
