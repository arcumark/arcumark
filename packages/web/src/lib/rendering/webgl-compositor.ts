export type WipeRect = { x0: number; y0: number; x1: number; y1: number } | null;

export type WebGLClipEffects = {
	opacity: number;
	brightness: number;
	contrast: number;
	saturation: number;
	blur: number;
	levels?: {
		inputBlack: number;
		inputWhite: number;
		outputBlack: number;
		outputWhite: number;
		gamma: number;
	};
	whiteBalance?: { temperature: number; tint: number };
	colorWheel?: { hue: number; saturation: number; lightness: number };
	curvesLut?: Uint8Array | null;
	chromaKey?: {
		enabled: boolean;
		color: string;
		tolerance: number;
		edgeSoftness: number;
		spillSuppression: number;
	};
	wipeRect?: WipeRect;
};

type TextureSource = TexImageSource | VideoFrame;

type TextureEntry = {
	texture: WebGLTexture;
	width: number;
	height: number;
	initialized: boolean;
	lastSource: TextureSource | null;
};

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;
out vec2 v_screenCoord;

void main() {
	v_texCoord = a_texCoord;
	v_screenCoord = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
	gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform sampler2D u_curvesLut;

uniform float u_opacity;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_blur;
uniform vec2 u_texelSize;

uniform float u_useLevels;
uniform vec4 u_levels;
uniform float u_gamma;

uniform float u_useWhiteBalance;
uniform vec3 u_whiteBalance;

uniform float u_useColorWheel;
uniform vec3 u_colorWheel;

uniform float u_useCurves;

uniform float u_useChromaKey;
uniform vec3 u_keyYuv;
uniform vec3 u_chromaKeyParams;

uniform float u_useWipe;
uniform vec4 u_wipeRect;

in vec2 v_texCoord;
in vec2 v_screenCoord;

out vec4 outColor;

vec3 rgbToHsl(vec3 color) {
	float maxc = max(color.r, max(color.g, color.b));
	float minc = min(color.r, min(color.g, color.b));
	float h = 0.0;
	float s = 0.0;
	float l = (maxc + minc) * 0.5;

	if (maxc != minc) {
		float d = maxc - minc;
		s = l > 0.5 ? d / (2.0 - maxc - minc) : d / (maxc + minc);
		if (maxc == color.r) {
			h = (color.g - color.b) / d + (color.g < color.b ? 6.0 : 0.0);
		} else if (maxc == color.g) {
			h = (color.b - color.r) / d + 2.0;
		} else {
			h = (color.r - color.g) / d + 4.0;
		}
		h /= 6.0;
	}

	return vec3(h, s, l);
}

float hueToRgb(float p, float q, float t) {
	if (t < 0.0) t += 1.0;
	if (t > 1.0) t -= 1.0;
	if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
	if (t < 1.0 / 2.0) return q;
	if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
	return p;
}

vec3 hslToRgb(vec3 hsl) {
	float h = hsl.x;
	float s = hsl.y;
	float l = hsl.z;
	if (s == 0.0) {
		return vec3(l);
	}
	float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
	float p = 2.0 * l - q;
	float r = hueToRgb(p, q, h + 1.0 / 3.0);
	float g = hueToRgb(p, q, h);
	float b = hueToRgb(p, q, h - 1.0 / 3.0);
	return vec3(r, g, b);
}

vec4 sampleWithBlur(vec2 uv) {
	if (u_blur <= 0.0) {
		return texture(u_texture, uv);
	}
	vec2 offset = u_texelSize * u_blur;
	vec4 sum = texture(u_texture, uv) * 4.0;
	sum += texture(u_texture, uv + vec2(offset.x, 0.0));
	sum += texture(u_texture, uv - vec2(offset.x, 0.0));
	sum += texture(u_texture, uv + vec2(0.0, offset.y));
	sum += texture(u_texture, uv - vec2(0.0, offset.y));
	return sum / 8.0;
}

void main() {
	if (u_useWipe > 0.5) {
		if (v_screenCoord.x < u_wipeRect.x || v_screenCoord.x > u_wipeRect.z ||
			v_screenCoord.y < u_wipeRect.y || v_screenCoord.y > u_wipeRect.w) {
			discard;
		}
	}

	vec4 color = sampleWithBlur(v_texCoord);

	color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;
	color.rgb *= u_brightness;
	float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
	color.rgb = mix(vec3(luma), color.rgb, u_saturation);

	float alpha = color.a;

	if (u_useChromaKey > 0.5) {
		float y = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		float u = dot(color.rgb, vec3(-0.14713, -0.28886, 0.436));
		float v = dot(color.rgb, vec3(0.615, -0.51499, -0.10001));
		vec3 diff = (vec3(y, u, v) - u_keyYuv) / 255.0;
		float distance = length(diff);
		float tolerance = u_chromaKeyParams.x;
		float edgeSoftness = u_chromaKeyParams.y;

		float ckAlpha = 1.0;
		if (distance < tolerance) {
			ckAlpha = 0.0;
		} else if (distance < tolerance + edgeSoftness) {
			float t = (distance - tolerance) / edgeSoftness;
			ckAlpha = t;
		}

		float spillSuppression = u_chromaKeyParams.z;
		if (spillSuppression > 0.0 && ckAlpha < 1.0) {
			float greenDominant = step(color.r, color.g) * step(color.b, color.g);
			float blueDominant = step(color.r, color.b) * step(color.g, color.b);
			float ratio = (greenDominant > 0.5) ? (color.g / (color.r + color.g + color.b + 0.001))
				: (color.b / (color.r + color.g + color.b + 0.001));
			float reduction = (1.0 - ckAlpha) * spillSuppression * max(0.0, ratio - 0.4) * 2.0;
			if (greenDominant > 0.5) {
				color.r = min(1.0, color.r + reduction * 0.08);
				color.g = max(0.0, color.g - reduction * 0.12);
				color.b = min(1.0, color.b + reduction * 0.04);
			} else if (blueDominant > 0.5) {
				color.r = min(1.0, color.r + reduction * 0.04);
				color.g = min(1.0, color.g + reduction * 0.04);
				color.b = max(0.0, color.b - reduction * 0.12);
			}
		}

		alpha *= ckAlpha;
	}

	if (u_useLevels > 0.5) {
		vec3 levelsInput = (color.rgb * 255.0 - u_levels.x) / max(1.0, u_levels.y - u_levels.x);
		levelsInput = clamp(levelsInput, 0.0, 1.0);
		levelsInput = pow(levelsInput, vec3(1.0 / max(u_gamma, 0.001)));
		color.rgb = levelsInput * (u_levels.w - u_levels.z) / 255.0 + (u_levels.z / 255.0);
	}

	if (u_useWhiteBalance > 0.5) {
		color.rgb *= u_whiteBalance;
	}

	if (u_useColorWheel > 0.5) {
		vec3 hsl = rgbToHsl(color.rgb);
		hsl.x = mod(hsl.x + u_colorWheel.x / 360.0, 1.0);
		hsl.y = clamp(hsl.y + u_colorWheel.y / 100.0, 0.0, 1.0);
		hsl.z = clamp(hsl.z + u_colorWheel.z / 100.0, 0.0, 1.0);
		color.rgb = hslToRgb(hsl);
	}

	if (u_useCurves > 0.5) {
		float r = texture(u_curvesLut, vec2(color.r, 0.5)).r;
		float g = texture(u_curvesLut, vec2(color.g, 0.5)).g;
		float b = texture(u_curvesLut, vec2(color.b, 0.5)).b;
		color.rgb = vec3(r, g, b);
	}

	alpha *= u_opacity;
	outColor = vec4(clamp(color.rgb, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		if (info) {
			console.warn("[export] WebGL shader compile failed:", info);
		}
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
	const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
	if (!vs || !fs) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		if (info) {
			console.warn("[export] WebGL program link failed:", info);
		}
		gl.deleteProgram(program);
		return null;
	}
	return program;
}

function buildCurveLut(points: { x: number; y: number }[]) {
	const lut = Array.from({ length: 256 }, () => 0);
	const sorted = [...points].sort((a, b) => a.x - b.x);
	for (let i = 0; i < 256; i++) {
		const x = i / 255;
		let y = x;
		if (sorted.length === 0) {
			y = x;
		} else if (x <= sorted[0].x) {
			y = sorted[0].y;
		} else if (x >= sorted[sorted.length - 1].x) {
			y = sorted[sorted.length - 1].y;
		} else {
			for (let j = 0; j < sorted.length - 1; j++) {
				if (x >= sorted[j].x && x <= sorted[j + 1].x) {
					const t = (x - sorted[j].x) / (sorted[j + 1].x - sorted[j].x);
					y = sorted[j].y + t * (sorted[j + 1].y - sorted[j].y);
					break;
				}
			}
		}
		lut[i] = Math.round(y * 255);
	}
	return lut;
}

export function buildCurvesLutTexture(curves: {
	master: { x: number; y: number }[];
	red: { x: number; y: number }[];
	green: { x: number; y: number }[];
	blue: { x: number; y: number }[];
}) {
	const master = buildCurveLut(curves.master);
	const red = buildCurveLut(curves.red);
	const green = buildCurveLut(curves.green);
	const blue = buildCurveLut(curves.blue);
	const data = new Uint8Array(256 * 4);
	for (let i = 0; i < 256; i++) {
		const masterValue = master[i];
		data[i * 4] = red[masterValue];
		data[i * 4 + 1] = green[masterValue];
		data[i * 4 + 2] = blue[masterValue];
		data[i * 4 + 3] = 255;
	}
	return data;
}

function computeWhiteBalance(temperature: number, tint: number) {
	let r = 1;
	let g = 1;
	let b = 1;
	if (temperature < 6500) {
		r = 1;
		g = 0.39 * Math.log(temperature / 100) - 0.5;
		b = 0.543 * Math.log(temperature / 100) - 0.8;
	} else {
		r = 0.543 * Math.log(temperature / 100) - 0.8;
		g = 0.39 * Math.log(temperature / 100) - 0.5;
		b = 1;
	}
	const tintFactor = tint / 150;
	r += tintFactor * 0.1;
	g -= tintFactor * 0.05;
	b -= tintFactor * 0.1;
	const max = Math.max(r, g, b);
	if (max > 1) {
		r /= max;
		g /= max;
		b /= max;
	}
	return { r, g, b };
}

function hexToRgb(hex: string) {
	const safe = hex.startsWith("#") ? hex.slice(1) : hex;
	const r = parseInt(safe.slice(0, 2), 16) || 0;
	const g = parseInt(safe.slice(2, 4), 16) || 0;
	const b = parseInt(safe.slice(4, 6), 16) || 0;
	return { r, g, b };
}

export class WebGLCompositor {
	static create(canvas: HTMLCanvasElement) {
		const gl = canvas.getContext("webgl2", {
			alpha: true,
			premultipliedAlpha: false,
			preserveDrawingBuffer: true,
		});
		if (!gl) {
			console.warn("[export] WebGL2 context unavailable.");
			return null;
		}
		const program = createProgram(gl);
		if (!program) {
			console.warn("[export] WebGL program creation failed.");
			return null;
		}
		return new WebGLCompositor(canvas, gl, program);
	}

	private canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;
	private program: WebGLProgram;
	private vao: WebGLVertexArrayObject;
	private buffer: WebGLBuffer;
	private vertexData: Float32Array;
	private textures = new Map<string, TextureEntry>();
	private curvesTexture: WebGLTexture;
	private curvesKey: string | null = null;

	private locations: Record<string, WebGLUniformLocation | null>;
	private attribs: { position: number; texCoord: number };

	constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, program: WebGLProgram) {
		this.canvas = canvas;
		this.gl = gl;
		this.program = program;

		const vao = gl.createVertexArray();
		const buffer = gl.createBuffer();
		if (!vao || !buffer) throw new Error("Failed to init WebGL buffers");
		this.vao = vao;
		this.buffer = buffer;
		this.vertexData = new Float32Array(16);

		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

		this.attribs = {
			position: gl.getAttribLocation(program, "a_position"),
			texCoord: gl.getAttribLocation(program, "a_texCoord"),
		};

		gl.enableVertexAttribArray(this.attribs.position);
		gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, 16, 0);
		gl.enableVertexAttribArray(this.attribs.texCoord);
		gl.vertexAttribPointer(this.attribs.texCoord, 2, gl.FLOAT, false, 16, 8);

		const curvesTexture = gl.createTexture();
		if (!curvesTexture) throw new Error("Failed to init curves texture");
		this.curvesTexture = curvesTexture;
		gl.bindTexture(gl.TEXTURE_2D, curvesTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		this.locations = {
			u_texture: gl.getUniformLocation(program, "u_texture"),
			u_curvesLut: gl.getUniformLocation(program, "u_curvesLut"),
			u_opacity: gl.getUniformLocation(program, "u_opacity"),
			u_brightness: gl.getUniformLocation(program, "u_brightness"),
			u_contrast: gl.getUniformLocation(program, "u_contrast"),
			u_saturation: gl.getUniformLocation(program, "u_saturation"),
			u_blur: gl.getUniformLocation(program, "u_blur"),
			u_texelSize: gl.getUniformLocation(program, "u_texelSize"),
			u_useLevels: gl.getUniformLocation(program, "u_useLevels"),
			u_levels: gl.getUniformLocation(program, "u_levels"),
			u_gamma: gl.getUniformLocation(program, "u_gamma"),
			u_useWhiteBalance: gl.getUniformLocation(program, "u_useWhiteBalance"),
			u_whiteBalance: gl.getUniformLocation(program, "u_whiteBalance"),
			u_useColorWheel: gl.getUniformLocation(program, "u_useColorWheel"),
			u_colorWheel: gl.getUniformLocation(program, "u_colorWheel"),
			u_useCurves: gl.getUniformLocation(program, "u_useCurves"),
			u_useChromaKey: gl.getUniformLocation(program, "u_useChromaKey"),
			u_keyYuv: gl.getUniformLocation(program, "u_keyYuv"),
			u_chromaKeyParams: gl.getUniformLocation(program, "u_chromaKeyParams"),
			u_useWipe: gl.getUniformLocation(program, "u_useWipe"),
			u_wipeRect: gl.getUniformLocation(program, "u_wipeRect"),
		};

		gl.useProgram(this.program);
		gl.uniform1i(this.locations.u_texture, 0);
		gl.uniform1i(this.locations.u_curvesLut, 1);

		gl.enable(gl.BLEND);
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
	}

	setSize(width: number, height: number) {
		this.gl.viewport(0, 0, width, height);
	}

	beginFrame() {
		const gl = this.gl;
		gl.clearColor(0, 0, 0, 1);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	flush() {
		this.gl.flush();
	}

	private getTexture(id: string) {
		const existing = this.textures.get(id);
		if (existing) return existing;
		const texture = this.gl.createTexture();
		if (!texture) throw new Error("Failed to create texture");
		const entry = { texture, width: 0, height: 0, initialized: false, lastSource: null };
		this.textures.set(id, entry);
		return entry;
	}

	private uploadTexture(
		entry: TextureEntry,
		source: TextureSource,
		width: number,
		height: number,
		allowSkip: boolean
	) {
		if (
			allowSkip &&
			entry.lastSource === source &&
			entry.width === width &&
			entry.height === height
		) {
			return;
		}
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, entry.texture);
		if (!entry.initialized) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			entry.initialized = true;
		}
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		entry.width = width;
		entry.height = height;
		entry.lastSource = allowSkip ? source : null;
	}

	private updateCurvesTexture(curvesLut: Uint8Array | null) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.curvesTexture);
		if (curvesLut) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curvesLut);
		}
		gl.activeTexture(gl.TEXTURE0);
	}

	drawClip(
		sourceId: string,
		source: TextureSource,
		sourceWidth: number,
		sourceHeight: number,
		positions: Float32Array,
		uvs: Float32Array,
		effects: WebGLClipEffects
	) {
		const gl = this.gl;
		const entry = this.getTexture(sourceId);

		const isStaticSource =
			(typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) ||
			(typeof SVGImageElement !== "undefined" && source instanceof SVGImageElement) ||
			(typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap);
		this.uploadTexture(entry, source, sourceWidth, sourceHeight, isStaticSource);

		for (let i = 0; i < 4; i++) {
			this.vertexData[i * 4] = positions[i * 2];
			this.vertexData[i * 4 + 1] = positions[i * 2 + 1];
			this.vertexData[i * 4 + 2] = uvs[i * 2];
			this.vertexData[i * 4 + 3] = uvs[i * 2 + 1];
		}

		gl.useProgram(this.program);
		gl.bindVertexArray(this.vao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, entry.texture);

		const levels = effects.levels;
		const wb = effects.whiteBalance;
		const wheel = effects.colorWheel;
		const curves = effects.curvesLut ?? null;
		const chromaKey = effects.chromaKey;

		gl.uniform1f(this.locations.u_opacity, effects.opacity);
		gl.uniform1f(this.locations.u_brightness, effects.brightness);
		gl.uniform1f(this.locations.u_contrast, effects.contrast);
		gl.uniform1f(this.locations.u_saturation, effects.saturation);
		gl.uniform1f(this.locations.u_blur, effects.blur);
		gl.uniform2f(this.locations.u_texelSize, 1 / sourceWidth, 1 / sourceHeight);

		gl.uniform1f(this.locations.u_useLevels, levels ? 1 : 0);
		if (levels) {
			gl.uniform4f(
				this.locations.u_levels,
				levels.inputBlack,
				levels.inputWhite,
				levels.outputBlack,
				levels.outputWhite
			);
			gl.uniform1f(this.locations.u_gamma, levels.gamma);
		} else {
			gl.uniform4f(this.locations.u_levels, 0, 255, 0, 255);
			gl.uniform1f(this.locations.u_gamma, 1);
		}

		gl.uniform1f(this.locations.u_useWhiteBalance, wb ? 1 : 0);
		if (wb) {
			const multipliers = computeWhiteBalance(wb.temperature, wb.tint);
			gl.uniform3f(this.locations.u_whiteBalance, multipliers.r, multipliers.g, multipliers.b);
		} else {
			gl.uniform3f(this.locations.u_whiteBalance, 1, 1, 1);
		}

		gl.uniform1f(this.locations.u_useColorWheel, wheel ? 1 : 0);
		if (wheel) {
			gl.uniform3f(this.locations.u_colorWheel, wheel.hue, wheel.saturation, wheel.lightness);
		} else {
			gl.uniform3f(this.locations.u_colorWheel, 0, 0, 0);
		}

		gl.uniform1f(this.locations.u_useCurves, curves ? 1 : 0);
		if (curves) {
			const key = JSON.stringify(curves);
			if (key !== this.curvesKey) {
				this.curvesKey = key;
				this.updateCurvesTexture(curves);
			}
		}

		gl.uniform1f(this.locations.u_useChromaKey, chromaKey?.enabled ? 1 : 0);
		if (chromaKey?.enabled) {
			const rgb = hexToRgb(chromaKey.color);
			const keyY = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
			const keyU = -0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b;
			const keyV = 0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b;
			gl.uniform3f(this.locations.u_keyYuv, keyY, keyU, keyV);
			gl.uniform3f(
				this.locations.u_chromaKeyParams,
				chromaKey.tolerance / 100,
				chromaKey.edgeSoftness / 100,
				chromaKey.spillSuppression / 100
			);
		} else {
			gl.uniform3f(this.locations.u_keyYuv, 0, 0, 0);
			gl.uniform3f(this.locations.u_chromaKeyParams, 0, 0, 0);
		}

		const wipeRect = effects.wipeRect ?? null;
		gl.uniform1f(this.locations.u_useWipe, wipeRect ? 1 : 0);
		if (wipeRect) {
			gl.uniform4f(this.locations.u_wipeRect, wipeRect.x0, wipeRect.y0, wipeRect.x1, wipeRect.y1);
		} else {
			gl.uniform4f(this.locations.u_wipeRect, 0, 0, 1, 1);
		}

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}
