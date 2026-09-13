import {
	asObject,
	GptImageError,
	ImageDiagnostics,
	recoverableImageUrl,
	safeToken,
} from './GptImageDiagnostics';
import { ImageDownloadResult } from './GptImageDownload';

export interface GptImageResult {
	buffer: Buffer;
	mimeType: string;
	extension: string;
	imageUrl?: string;
	diagnostics: ImageDiagnostics;
}

function detectImageFormat(buffer: Buffer): { mimeType: string; extension: string } {
	if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
		return { mimeType: 'image/png', extension: 'png' };
	}
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return { mimeType: 'image/jpeg', extension: 'jpeg' };
	}
	if (
		buffer.length >= 12 &&
		buffer.toString('ascii', 0, 4) === 'RIFF' &&
		buffer.toString('ascii', 8, 12) === 'WEBP'
	) {
		return { mimeType: 'image/webp', extension: 'webp' };
	}
	throw new Error('返回内容不是有效的 PNG、JPEG 或 WEBP 图片。');
}

export async function resolveGptImageResponse(
	response: unknown,
	download: (url: string) => Promise<ImageDownloadResult>,
): Promise<GptImageResult> {
	if (typeof response === 'string') {
		try {
			response = JSON.parse(response);
		} catch {
			throw new GptImageError('图片接口返回了无法解析的 JSON。', { stage: 'response_parse' });
		}
	}
	const body = asObject(response);
	if (body.error) {
		const error = asObject(body.error);
		const code = safeToken(error.code);
		throw new GptImageError(`图片服务商返回业务错误${code ? `（${code}）` : ''}。`, {
			stage: 'response_parse',
			errorCode: code,
		});
	}
	const item = asObject(Array.isArray(body.data) ? body.data[0] : undefined);
	const rawUrl = typeof item.url === 'string' && item.url.trim() ? item.url : undefined;
	const imageUrl = recoverableImageUrl(rawUrl);
	let diagnostics: ImageDiagnostics = { stage: 'image_format', ...(imageUrl ? { imageUrl } : {}) };
	let buffer: Buffer;
	let format: { mimeType: string; extension: string };
	if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
		const base64 = item.b64_json.replace(/\s/g, '');
		if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
			throw new GptImageError('图片接口返回了无效的 Base64 数据。', diagnostics);
		}
		buffer = Buffer.from(base64, 'base64');
		try {
			format = detectImageFormat(buffer);
		} catch {
			throw new GptImageError('Base64 内容不是可识别的 PNG、JPEG 或 WEBP 图片。', diagnostics);
		}
	} else if (rawUrl) {
		if (!imageUrl)
			throw new GptImageError('图片 URL 必须是未嵌入登录凭据的 HTTP 或 HTTPS 地址。', {
				stage: 'url_validation',
			});
		const downloaded = await download(imageUrl);
		buffer = downloaded.buffer;
		diagnostics = downloaded.diagnostics;
		try {
			format = detectImageFormat(buffer);
		} catch {
			throw new GptImageError('下载内容不是图片：未识别到 PNG、JPEG 或 WEBP 文件头。', {
				...diagnostics,
				stage: 'image_format',
			});
		}
	} else {
		throw new GptImageError('图片接口未返回图像：data[0] 中没有可用的 b64_json 或 url。', {
			stage: 'response_parse',
		});
	}
	return { buffer, ...format, diagnostics, ...(imageUrl ? { imageUrl } : {}) };
}
