import fs from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

// Static generation is required for the license page to be accessible via the web
export const dynamic = "force-static";

export const metadata: Metadata = {
	title: "Third-Party Licenses",
	description: "Open source dependencies used by Arcumark",
};

type PkgInfo = {
	name: string;
	version: string;
	license: string;
	homepage?: string;
	repo?: string;
};

function normalizeRepo(repo: unknown): string | undefined {
	if (!repo) return undefined;
	if (typeof repo === "string") return repo.replace(/^git\+/, "").replace(/\.git$/, "");
	if (
		typeof repo === "object" &&
		repo !== null &&
		"url" in repo &&
		typeof (repo as { url: string }).url === "string"
	) {
		return (repo as { url: string }).url.replace(/^git\+/, "").replace(/\.git$/, "");
	}
	return undefined;
}

async function readPackageJson(pkgName: string): Promise<{ [key: string]: unknown } | null> {
	try {
		const pkgPath = path.join(process.cwd(), "node_modules", pkgName, "package.json");
		const data = await fs.readFile(pkgPath, "utf8");
		return JSON.parse(data);
	} catch {
		return null;
	}
}

async function collectPackages(): Promise<PkgInfo[]> {
	const rootPkgPath = path.join(process.cwd(), "package.json");
	const rootRaw = await fs.readFile(rootPkgPath, "utf8");
	const root = JSON.parse(rootRaw) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};

	const entries = Object.entries({ ...root.dependencies, ...root.devDependencies });

	const results: PkgInfo[] = [];
	for (const [name, versionRange] of entries) {
		const pkgJson = await readPackageJson(name);
		const license = (pkgJson?.license as string | undefined) || "UNKNOWN";
		const homepage = (pkgJson?.homepage as string | undefined) || undefined;
		const repo = normalizeRepo(pkgJson?.repository);
		results.push({
			name,
			version: (pkgJson?.version as string) || versionRange,
			license,
			homepage,
			repo,
		});
	}

	results.sort((a, b) => a.name.localeCompare(b.name));
	return results;
}

export default async function ThirdPartyLicensePage() {
	const packages = await collectPackages();

	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-50">
			<Card className="w-full max-w-3xl border border-neutral-800 bg-neutral-900">
				<CardHeader>
					<CardTitle>Third-Party Licenses</CardTitle>
					<CardDescription>A list of third-party dependencies used by Arcumark.</CardDescription>
				</CardHeader>
				<CardContent>
					<ScrollArea className="grid h-[500px]">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Version</TableHead>
									<TableHead>License</TableHead>
									<TableHead>Repository</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{packages.map((pkg) => (
									<TableRow key={pkg.name}>
										<TableCell className="font-mono font-semibold">{pkg.name}</TableCell>
										<TableCell className="font-mono text-xs">{pkg.version}</TableCell>
										<TableCell>{pkg.license}</TableCell>
										<TableCell className="break-all">
											{pkg.repo ? (
												pkg.repo.startsWith("https") ? (
													<a
														href={pkg.repo}
														target="_blank"
														rel="noopener noreferrer"
														className="text-primary hover:underline"
													>
														{pkg.repo}
													</a>
												) : (
													<span className="text-neutral-400">{pkg.repo}</span>
												)
											) : (
												<span className="text-neutral-400">N/A</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</ScrollArea>
				</CardContent>
			</Card>
		</div>
	);
}
