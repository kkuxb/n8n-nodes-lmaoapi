export interface GptImageResult {
	buffer: Buffer;
	mimeType: string;
	extension: string;
	imageUrl?: string;
}

function asObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, unknown>
		: {};
}

function detectImageFormat(buffer: Buffer): { mimeType: string; extension: string } {
	if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
		return { mimeType: 'image/png', extension: 'png' };
	}
	if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return { mimeType: 'image/jpeg', extension: 'jpeg' };
	}
	if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
		return { mimeType: 'image/webp', extension: 'webp' };
	}
	throw new Error('返回内容不是有效的 PNG、JPEG 或 WEBP 图片。');
}

export async function resolveGptImageResponse(
	response: unknown,
	download: (url: string) => Promise<Buffer>,
): Promise<GptImageResult> {
	if (typeof response === 'string') {
		try {
			response = JSON.parse(response);
		} catch {
			throw new Error('图片接口返回了无法解析的 JSON。');
		}
	}
	const body = asObject(response);
	if (body.error) {
		const error = asObject(body.error);
		const code = typeof error.code === 'string' ? error.code.replace(/[^\w.-]/g, '').slice(0, 80) : '';
		throw new Error(`图片服务商返回业务错误${code ? `（${code}）` : ''}。`);
	}
	const item = asObject(Array.isArray(body.data) ? body.data[0] : undefined);
	const imageUrl = typeof item.url === 'string' && item.url.trim() ? item.url : undefined;
	let buffer: Buffer;
	let format: { mimeType: string; extension: string };
	if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
		const base64 = item.b64_json.replace(/\s/g, '');
		if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
			throw new Error('图片接口返回了无效的 Base64 数据。');
		}
		buffer = Buffer.from(base64, 'base64');
		format = detectImageFormat(buffer);
	} else if (imageUrl) {
		let url: URL;
		try {
			url = new URL(imageUrl);
		} catch {
			throw new Error('图片接口返回了无效的图片 URL。');
		}
		if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
			throw new Error('图片 URL 必须是未嵌入登录凭据的 HTTP 或 HTTPS 地址。');
		}
		try {
			buffer = await download(imageUrl);
			format = detectImageFormat(buffer);
		} catch {
			// Do not include the signed URL or repeat the paid generation request.
			throw new Error('图片已生成并返回 URL，但下载失败或下载内容不是图片。请检查下载连接，勿直接重复生图以免再次扣费。');
		}
	} else {
		throw new Error('图片接口未返回图像：data[0] 中没有可用的 b64_json 或 url。');
	}
	return { buffer, ...format, ...(imageUrl ? { imageUrl } : {}) };
}
