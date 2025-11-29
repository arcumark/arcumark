import fs from "fs/promises";
import path from "path";
import type { Metadata } from "next";

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

	const entries = Object.entries({ ...(root.dependencies || {}), ...(root.devDependencies || {}) });

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
			<div className="grid w-full max-w-3xl gap-6 border border-neutral-800 bg-neutral-900 p-8">
				<div className="space-y-2">
					<div className="text-3xl font-bold">Third-Party Licenses</div>
					<div className="mb-2 text-base text-neutral-400">
						A list of third-party dependencies used by Arcumark.
					</div>
				</div>
				<div className="max-h-96 space-y-2 overflow-y-auto bg-neutral-800 p-4 font-mono text-sm whitespace-pre-wrap text-neutral-200">
					{packages.map((pkg) => (
						<div key={pkg.name}>
							<div>
								{pkg.name} ({pkg.version})
							</div>
							<div>
								<span className="text-neutral-400">License:</span> {pkg.license}
							</div>
							<div>
								<span className="text-neutral-400">Repository:</span> {pkg.repo}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
