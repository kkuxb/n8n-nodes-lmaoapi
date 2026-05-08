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

function normalizeGptImageBackground(background: GptImageBackground): string {
	return background === 'transparent' ? 'transparent_background' : background;
}

export function isGptImageModel(model: string): boolean {
	return model === 'gpt-image-2';
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
