import { IExecuteFunctions } from 'n8n-workflow';

export const MAX_VIDEO_SECONDS = 3600;
const MAX_VIDEO_BYTES = 2_000_000_000;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;

export class VideoError extends Error {}

export interface VideoStream extends AsyncIterable<Uint8Array | string> {
	destroy(error?: Error): unknown;
}

function privateAddress(address: string): boolean {
	const host = address.toLowerCase().replace(/^\[|\]$/g, '');
	if (host.includes(':')) {
		if (host.startsWith('::ffff:')) {
			const mapped = host.slice(7);
			if (mapped.includes('.')) return privateAddress(mapped);
			const parts = mapped.split(':');
			if (parts.length !== 2) return true;
			const value = Number.parseInt(parts[0], 16) * 65536 + Number.parseInt(parts[1], 16);
			return privateAddress([24, 16, 8, 0].map((bits) => (value >>> bits) & 255).join('.'));
		}
		return (
			host === '::' || host === '::1' || /^(?:f[cd]|fe[89ab])/i.test(host) || !/^[23]/.test(host)
		);
	}
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
	const [a, b] = host.split('.').map(Number);
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19))
	);
}

export async function validateVideoUrl(value: string): Promise<string> {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		throw new VideoError('请提供有效的视频 HTTP(S) 直链。');
	}
	const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		url.username ||
		url.password ||
		url.hash ||
		!host ||
		host === 'localhost' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local')
	) {
		throw new VideoError('视频需为无登录信息的公网 HTTP(S) 直链。');
	}
	if (privateAddress(host)) {
		throw new VideoError('视频直链不能指向本机或私有网络。');
	}
	return url.href;
}

interface Mp4Box {
	type: string;
	size: number;
	payload: number;
	end: number;
}

function integer64(bytes: Buffer, offset: number): number {
	if (offset + 8 > bytes.length) throw new VideoError('MP4 时间信息不完整。');
	const value = bytes.readUInt32BE(offset) * 0x100000000 + bytes.readUInt32BE(offset + 4);
	if (!Number.isSafeInteger(value)) throw new VideoError('MP4 数值超出支持范围。');
	return value;
}

function boxAt(bytes: Buffer, offset: number, available: number): Mp4Box {
	if (offset + 8 > bytes.length) throw new VideoError('MP4 文件结构不完整。');
	let size = bytes.readUInt32BE(offset),
		header = 8;
	if (size === 1) {
		size = integer64(bytes, offset + 8);
		header = 16;
	} else if (size === 0) size = available;
	if (size < header || size > available) throw new VideoError('MP4 文件结构无效。');
	return {
		type: bytes.toString('ascii', offset + 4, offset + 8),
		size,
		payload: offset + header,
		end: offset + size,
	};
}

function childBoxes(bytes: Buffer, start: number, end: number): Mp4Box[] {
	const boxes: Mp4Box[] = [];
	for (let offset = start; offset < end; ) {
		if (boxes.length >= 10000) throw new VideoError('MP4 元数据过于复杂。');
		const box = boxAt(bytes, offset, end - offset);
		boxes.push(box);
		offset = box.end;
	}
	return boxes;
}

export function mp4Duration(moov: Buffer): number {
	const parent = boxAt(moov, 0, moov.length);
	if (parent.type !== 'moov' || parent.end !== moov.length)
		throw new VideoError('缺少 MP4 视频元数据。');
	const children = childBoxes(moov, parent.payload, parent.end);
	if (children.some((box) => box.type === 'mvex'))
		throw new VideoError('当前尚不支持分片式 MP4 视频。');
	const headers = children.filter((box) => box.type === 'mvhd');
	const hasVideo = children
		.filter((box) => box.type === 'trak')
		.some((track) =>
			childBoxes(moov, track.payload, track.end)
				.filter((box) => box.type === 'mdia')
				.some((media) =>
					childBoxes(moov, media.payload, media.end).some(
						(box) =>
							box.type === 'hdlr' &&
							box.end - box.payload >= 12 &&
							moov.toString('ascii', box.payload + 8, box.payload + 12) === 'vide',
					),
				),
		);
	if (!hasVideo || headers.length !== 1)
		throw new VideoError('文件没有可识别的视频轨道或时长信息。');
	const header = headers[0],
		version = moov[header.payload];
	if (![0, 1].includes(version) || header.end - header.payload < (version ? 32 : 20)) {
		throw new VideoError('MP4 时长信息不支持。');
	}
	const scale = moov.readUInt32BE(header.payload + (version ? 20 : 12));
	const ticks = version
		? integer64(moov, header.payload + 24)
		: moov.readUInt32BE(header.payload + 16);
	const seconds = ticks / scale;
	if (!scale || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_VIDEO_SECONDS) {
		throw new VideoError('当前视频理解支持时长明确、最长1小时的普通 MP4 视频。');
	}
	return seconds;
}

export async function probeVideo(
	context: IExecuteFunctions,
	inputUrl: string,
	signal: AbortSignal,
): Promise<{ url: string; duration: number }> {
	let url = await validateVideoUrl(inputUrl),
		total = 0,
		redirects = 0;
	async function range(start: number, length: number): Promise<Buffer> {
		for (;;) {
			if (signal.aborted) throw new VideoError('视频理解已取消或超时。');
			const response = await context.helpers.httpRequest({
				method: 'GET',
				url,
				headers: { Range: `bytes=${start}-${start + length - 1}`, 'Accept-Encoding': 'identity' },
				encoding: 'stream',
				returnFullResponse: true,
				ignoreHttpStatusErrors: true,
				disableFollowRedirect: true,
				timeout: 30000,
				abortSignal: signal,
			});
			const body = response.body as VideoStream;
			const cancel = () => body?.destroy();
			signal.addEventListener('abort', cancel, { once: true });
			if (signal.aborted) cancel();
			try {
				if (signal.aborted) throw new VideoError('视频读取已取消或超时。');
				if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
					if (++redirects > 5 || typeof response.headers.location !== 'string')
						throw new VideoError('视频地址重定向失败。');
					url = await validateVideoUrl(new URL(response.headers.location, url).href);
					continue;
				}
				if (response.statusCode !== 206)
					throw new VideoError('无法读取视频时长，请使用可直接下载且支持范围读取的普通 MP4 直链。');
				const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(response.headers['content-range']));
				if (!match || Number(match[1]) !== start)
					throw new VideoError('视频服务器返回了无效的范围信息。');
				const size = Number(match[3]),
					expected = Number(match[2]) - start + 1;
				if (
					!Number.isSafeInteger(size) ||
					size < 8 ||
					size > MAX_VIDEO_BYTES ||
					(total && size !== total) ||
					expected !== Math.min(length, size - start) ||
					expected <= 0
				)
					throw new VideoError('视频文件大小或范围信息无效（单文件最大2GB）。');
				total = size;
				let received = 0;
				const parts: Buffer[] = [];
				for await (const chunk of body) {
					const bytes = Buffer.from(chunk);
					received += bytes.length;
					if (received > expected) throw new VideoError('视频元数据超出读取上限。');
					parts.push(bytes);
				}
				if (received !== expected) throw new VideoError('视频元数据下载不完整。');
				return Buffer.concat(parts);
			} finally {
				signal.removeEventListener('abort', cancel);
				body?.destroy();
			}
		}
	}
	let offset = 0;
	for (let count = 0; count < 64; count++) {
		const bytes = await range(offset, 16);
		const box = boxAt(bytes, 0, total - offset);
		if (count === 0 && box.type !== 'ftyp')
			throw new VideoError('当前视频理解仅支持普通 MP4 视频直链。');
		if (box.type === 'moof') throw new VideoError('当前尚不支持分片式 MP4 视频。');
		if (box.type === 'moov') {
			if (box.size > MAX_METADATA_BYTES) throw new VideoError('视频元数据过大，无法读取时长。');
			return { url, duration: mp4Duration(await range(offset, box.size)) };
		}
		offset += box.size;
		if (offset >= total) break;
	}
	throw new VideoError('未找到可用的 MP4 视频时长信息。');
}
