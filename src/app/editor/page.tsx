"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "../../components/page-shell";
import { Button } from "@/components/ui/button";
import { createProjectId } from "@/lib/utils";

export default function EditorIndexPage() {
	const router = useRouter();

	const handleNew = () => {
		const id = createProjectId();
		router.push(`/editor/${id}`);
	};

	return (
		<PageShell title="Editor" description="Select or create a project ID to open the editor.">
			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={handleNew} variant="default">
					Create new project
				</Button>
			</div>
		</PageShell>
	);
}
