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
		<div className="flex min-h-screen items-center justify-center bg-neutral-950 px-8 py-10 text-neutral-50">
			<div className="grid w-full max-w-3xl gap-6 border border-neutral-800 bg-neutral-900 p-8">
				<div className="space-y-2">
					<div className="text-3xl font-bold">Editor</div>
					<div className="text-base text-neutral-400">
						Select or create a project ID to open the editor.
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<button
						className="flex cursor-pointer items-center gap-2 border border-blue-700 bg-blue-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
						onClick={handleNew}
					>
						Create new project
					</button>
				</div>
			</div>
		</div>
	);
}
