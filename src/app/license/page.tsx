import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "License",
	description: "License for Arcumark",
};

const license = `MIT License

Copyright (c) 2025 Arcumark (maintained by Minagishl)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export default function LicensePage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 py-12 text-neutral-50">
			<div className="grid w-full max-w-3xl gap-6 border border-neutral-800 bg-neutral-900 p-8">
				<div className="space-y-2">
					<div className="text-3xl font-bold">License</div>
					<div className="text-base text-neutral-400 mb-4">
						Arcumark is licensed under the MIT License.
					</div>
					<div className="whitespace-pre-wrap text-sm text-neutral-200 font-mono p-4 bg-neutral-800">
						{license}
					</div>
				</div>
			</div>
		</div>
	);
}
