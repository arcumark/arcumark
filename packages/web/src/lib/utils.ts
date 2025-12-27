import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Re-export from shared for convenience
export { createProjectId, isValidProjectId } from "@arcumark/shared";

/**
 * Checks if a project exists in localStorage (browser-specific)
 */
export function projectExistsInLocalStorage(projectId: string): boolean {
	if (typeof window === "undefined" || typeof localStorage === "undefined") return false;

	try {
		const key = `arcumark:timeline:${projectId}`;
		const stored = localStorage.getItem(key);
		return stored !== null;
	} catch {
		return false;
	}
}
