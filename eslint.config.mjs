import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.next/**",
			"**/.open-next/**",
			"**/build/**",
		],
	},
	// Next.js config for web package only
	...compat.extends("next/core-web-vitals", "next/typescript").map((config) => ({
		...config,
		files: ["packages/web/**/*.ts", "packages/web/**/*.tsx"],
	})),
	{
		files: ["packages/web/**/*.ts", "packages/web/**/*.tsx"],
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
		},
	},
	// TypeScript ESLint for non-web packages (shared, cli, mcp)
	{
		files: [
			"packages/shared/**/*.ts",
			"packages/cli/**/*.ts",
			"packages/mcp/**/*.ts",
		],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
];

export default eslintConfig;
