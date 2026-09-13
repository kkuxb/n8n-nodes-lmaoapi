import { sleepWithAbort } from 'n8n-workflow';
import {
	asObject,
	DownloadAttempt,
	GptImageError,
	headerValue,
	ImageDiagnostics,
	recoverableImageUrl,
	responseRequestId,
	responseStatus,
	safeToken,
} from './GptImageDiagnostics';

const ATTEMPT_TIMEOUT_MS = 20_000;
const DOWNLOAD_BUDGET_MS = 80_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];
const RETRY_CODES = new Set([
	'ECONNABORTED',
	'ETIMEDOUT',
	'ECONNRESET',
	'EPIPE',
	'EAI_AGAIN',
	'ERR_STREAM_PREMATURE_CLOSE',
]);
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type ImageDownloadResponse = { body: unknown; headers?: unknown; statusCode: number };
export type ImageDownloadRequest = (
	url: string,
	timeoutMs: number,
	signal: AbortSignal,
) => Promise<ImageDownloadResponse>;
export type ImageDownloadResult = { buffer: Buffer; diagnostics: ImageDiagnostics };
type DownloadRuntime = {
	signal?: AbortSignal;
	now?: () => number;
	wallNow?: () => number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	random?: () => number;
};

function cancelledError(): Error {
	return Object.assign(new Error('下载已取消。'), { code: 'ERR_CANCELED' });
}

async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw cancelledError();
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	signal?.addEventListener('abort', onAbort, { once: true });
	try {
		await sleepWithAbort(ms, controller.signal);
	} finally {
		signal?.removeEventListener('abort', onAbort);
		controller.abort();
	}
}

// Bound wall-clock time as well as the HTTP client's socket timeout.
async function boundedRequest(
	request: ImageDownloadRequest,
	url: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<ImageDownloadResponse> {
	if (signal?.aborted) throw cancelledError();
	const controller = new AbortController();
	const timerController = new AbortController();
	let onAbort: (() => void) | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		onAbort = () => {
			reject(cancelledError());
			controller.abort();
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		void waitForRetry(timeoutMs, timerController.signal).then(
			() => {
				reject(Object.assign(new Error('图片下载超过单次时间上限。'), { code: 'ETIMEDOUT' }));
				controller.abort();
			},
			() => {
				/* Completing the request cancels this deadline. */
			},
		);
	});
	try {
		return await Promise.race([
			Promise.resolve().then(() => request(url, timeoutMs, controller.signal)),
			deadline,
		]);
	} finally {
		timerController.abort();
		if (onAbort) signal?.removeEventListener('abort', onAbort);
	}
}

function retryAfterMs(headers: unknown, wallNow: number): number {
	const value = headerValue(headers, 'retry-after');
	if (!value) return 0;
	const seconds = Number(value);
	if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - wallNow) : 0;
}

function attemptDetails(
	response: unknown,
): Pick<DownloadAttempt, 'statusCode' | 'contentType' | 'bytes' | 'requestId'> {
	const object = asObject(response);
	const rawType = headerValue(object.headers, 'content-type')?.split(';')[0].trim().toLowerCase();
	const contentType = rawType && /^[\w.+-]+\/[\w.+-]+$/.test(rawType) ? rawType : undefined;
	const body = object.body ?? object.data;
	let bytes: number | undefined;
	if (Buffer.isBuffer(body) || body instanceof Uint8Array) bytes = body.byteLength;
	else if (body instanceof ArrayBuffer) bytes = body.byteLength;
	else if (typeof body === 'string') bytes = Buffer.byteLength(body);
	return {
		statusCode: responseStatus(response),
		contentType,
		bytes,
		requestId: responseRequestId(object.headers),
	};
}

export async function downloadGptImage(
	url: string,
	request: ImageDownloadRequest,
	runtime: DownloadRuntime = {},
): Promise<ImageDownloadResult> {
	const imageUrl = recoverableImageUrl(url);
	if (!imageUrl)
		throw new GptImageError('图片接口返回了无效的图片 URL。', { stage: 'url_validation' });
	const now = runtime.now ?? (() => performance.now());
	const sleep = runtime.sleep ?? waitForRetry;
	const startedAt = now();
	const attempts: DownloadAttempt[] = [];
	const diagnostics: ImageDiagnostics = {
		stage: 'download',
		imageUrl,
		downloadHost: new URL(imageUrl).hostname,
		attempts,
	};
	const fail = (reason: ImageDiagnostics['stopReason']): never => {
		diagnostics.elapsedMs = Math.max(0, Math.round(now() - startedAt));
		diagnostics.stopReason = reason;
		if (reason === 'cancelled') diagnostics.stage = 'cancelled';
		const last = attempts[attempts.length - 1];
		const status = last?.statusCode ? `下载 HTTP ${last.statusCode}` : '下载未收到 HTTP 响应';
		let message = '图片下载已取消，不会重新生图。';
		if (reason !== 'cancelled') {
			const code = last?.errorCode ? `；${last.errorCode}` : '';
			message = `图片已生成并返回 URL，但下载失败（已尝试 ${attempts.length} 次；${status}${code}）。请使用错误详情中的 imageUrl 单独下载，勿重新生图。`;
		}
		throw new GptImageError(message, diagnostics);
	};
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		if (runtime.signal?.aborted) fail('cancelled');
		const remaining = DOWNLOAD_BUDGET_MS - (now() - startedAt);
		if (remaining <= 0) fail('time_budget');
		const timeoutMs = Math.max(1, Math.floor(Math.min(ATTEMPT_TIMEOUT_MS, remaining)));
		const attemptStart = now();
		let response: ImageDownloadResponse | undefined;
		let errorCode: string | undefined;
		let errorName: string | undefined;
		let errorResponse: unknown;
		try {
			response = await boundedRequest(request, imageUrl, timeoutMs, runtime.signal);
		} catch (error) {
			const object = asObject(error);
			const causeCode = safeToken(asObject(object.cause).code);
			errorCode =
				causeCode && RETRY_CODES.has(causeCode) ? causeCode : (safeToken(object.code) ?? causeCode);
			if (
				errorCode === 'ERR_BAD_RESPONSE' &&
				typeof object.message === 'string' &&
				/stream has been aborted/i.test(object.message)
			) {
				errorCode = 'ERR_STREAM_PREMATURE_CLOSE';
			}
			errorName = safeToken(object.name);
			errorResponse = object.response;
		}
		const detail = attemptDetails(response ?? errorResponse);
		const retryable =
			detail.statusCode !== undefined && detail.statusCode >= 400
				? RETRY_STATUSES.has(detail.statusCode)
				: RETRY_CODES.has(errorCode ?? '');
		attempts.push({
			attempt,
			timeoutMs,
			durationMs: Math.max(0, Math.round(now() - attemptStart)),
			...detail,
			errorCode,
			errorName,
			retryable,
		});
		if (runtime.signal?.aborted || errorCode === 'ERR_CANCELED' || errorCode === 'ABORT_ERR')
			fail('cancelled');
		if (now() - startedAt >= DOWNLOAD_BUDGET_MS) fail('time_budget');
		if (response && response.statusCode >= 200 && response.statusCode < 300) {
			const body = response.body;
			if (
				!Buffer.isBuffer(body) &&
				!(body instanceof Uint8Array) &&
				!(body instanceof ArrayBuffer)
			) {
				throw new GptImageError('下载响应不是预期的二进制数据。', {
					...diagnostics,
					stage: 'image_format',
					elapsedMs: Math.round(now() - startedAt),
				});
			}
			return {
				buffer: Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body),
				diagnostics: { ...diagnostics, elapsedMs: Math.round(now() - startedAt) },
			};
		}
		if (!retryable) fail('non_retryable');
		if (attempt === MAX_ATTEMPTS) fail('attempt_limit');
		const jitter = Math.floor((runtime.random ?? Math.random)() * 250);
		const serverDelay = retryAfterMs(
			asObject(response ?? errorResponse).headers,
			(runtime.wallNow ?? Date.now)(),
		);
		const delay = Math.max(RETRY_DELAYS_MS[attempt - 1] + jitter, serverDelay);
		if (delay >= DOWNLOAD_BUDGET_MS - (now() - startedAt)) fail('time_budget');
		try {
			await sleep(delay, runtime.signal);
		} catch {
			fail('cancelled');
		}
	}
	return fail('attempt_limit');
}
