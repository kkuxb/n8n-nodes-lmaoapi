export type GptImageBackground = 'auto' | 'opaque' | 'transparent';
export type GptImageOutputFormat = 'png' | 'jpeg' | 'webp';
export type GptImageQuality = 'auto' | 'low' | 'medium' | 'high';

export interface GptImageInput {
	base64: string;
	mimeType: string;
	fileName?: string;
}

export interface GptImageMultipartFile {
	value: Buffer;
	options: {
		filename: string;
		contentType: string;
	};
}

export interface BuildGptImageRequestOptions {
	prompt: string;
	images: GptImageInput[];
	size: string;
	quality: GptImageQuality;
	background: GptImageBackground;
	outputFormat: GptImageOutputFormat;
}

export interface GptImageRequest {
	endpoint: '/images/generations' | '/images/edits';
	body: Record<string, unknown>;
	usesMultipart: boolean;
	outputFileName: string;
	outputMimeType: string;
}

const GPT_IMAGE_MIN_PIXELS = 655360;
const GPT_IMAGE_MAX_PIXELS = 8294400;
const GPT_IMAGE_MAX_SIDE = 3840;
const GPT_IMAGE_MAX_RATIO = 3;
const GPT_IMAGE_DIMENSION_MULTIPLE = 16;

function normalizeGptImageBackground(background: GptImageBackground): string {
	return background === 'transparent' ? 'transparent_background' : background;
}

export function isGptImageModel(model: string): boolean {
	return model === 'gpt-image-2';
}

export function resolveGptImageSize(size: string, customSize?: string): string {
	if (size !== 'custom') {
		return size;
	}

	const normalizedInput = customSize?.trim() ?? '';
	const match = normalizedInput.match(/^(\d+)\D+(\d+)$/);
	if (!match) {
		throw new Error('自定义分辨率格式无效，请填写类似 2048x1152、2048*1152 或 2048×1152 的格式。');
	}

	const width = Number(match[1]);
	const height = Number(match[2]);
	validateGptImageDimensions(width, height);

	return `${width}x${height}`;
}

function validateGptImageDimensions(width: number, height: number): void {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
		throw new Error('自定义分辨率必须包含两个正整数。');
	}

	if (width % GPT_IMAGE_DIMENSION_MULTIPLE !== 0 || height % GPT_IMAGE_DIMENSION_MULTIPLE !== 0) {
		throw new Error('自定义分辨率的宽和高都必须能被 16 整除。');
	}

	if (width > GPT_IMAGE_MAX_SIDE || height > GPT_IMAGE_MAX_SIDE) {
		throw new Error('自定义分辨率的最大边不能超过 3840px。');
	}

	const shorterSide = Math.min(width, height);
	const longerSide = Math.max(width, height);
	if (longerSide / shorterSide > GPT_IMAGE_MAX_RATIO) {
		throw new Error('自定义分辨率的长短边比例不能超过 3:1。');
	}

	const pixels = width * height;
	if (pixels < GPT_IMAGE_MIN_PIXELS || pixels > GPT_IMAGE_MAX_PIXELS) {
		throw new Error('自定义分辨率的总像素数必须在 655360 到 8294400 之间。');
	}
}

export function buildGptImageRequest(
	model: string,
	options: BuildGptImageRequestOptions,
): GptImageRequest {
	if (options.background === 'transparent' && options.outputFormat === 'jpeg') {
		throw new Error('GPT-Image-2 透明背景仅支持 PNG 或 WEBP 输出格式。');
	}

	const sharedBody: Record<string, unknown> = {
		model,
		prompt: options.prompt,
		size: options.size,
		quality: options.quality,
		background: normalizeGptImageBackground(options.background),
		output_format: options.outputFormat,
		n: 1,
	};

	const extension = options.outputFormat === 'jpeg' ? 'jpeg' : options.outputFormat;
	const mimeSubtype = options.outputFormat === 'jpeg' ? 'jpeg' : options.outputFormat;
	const request: GptImageRequest = {
		endpoint: options.images.length > 0 ? '/images/edits' : '/images/generations',
		body: sharedBody,
		usesMultipart: options.images.length > 0,
		outputFileName: `gpt_image_2.${extension}`,
		outputMimeType: `image/${mimeSubtype}`,
	};

	if (options.images.length > 0) {
		request.body.images = options.images;
	}

	return request;
}

export function buildGptImageMultipartFormData(
	body: Record<string, unknown>,
): Record<string, unknown> {
	const formData: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(body)) {
		if (key === 'images' || value === undefined) continue;
		formData[key] = value;
	}

	const images = body.images as GptImageInput[] | undefined;
	if (images?.length) {
		formData['image[]'] = images.map((image, index): GptImageMultipartFile => ({
			value: Buffer.from(image.base64, 'base64'),
			options: {
				filename: image.fileName ?? `reference-${index + 1}.${image.mimeType.split('/')[1] ?? 'png'}`,
				contentType: image.mimeType,
			},
		}));
	}

	return formData;
}
