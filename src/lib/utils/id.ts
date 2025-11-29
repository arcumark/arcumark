export function createProjectId(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `proj_${Math.random().toString(36).slice(2, 10)}`;
}
