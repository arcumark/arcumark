export function createProjectId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `proj_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Validates if a string is a valid project ID (UUID v4 or proj_ prefix format)
 */
export function isValidProjectId(id: string): boolean {
	if (!id || typeof id !== "string") return false;

	// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
	const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

	// Fallback format: proj_xxxxxxxx
	const projPrefixRegex = /^proj_[a-z0-9]{6,}$/;

	return uuidV4Regex.test(id) || projPrefixRegex.test(id);
}
