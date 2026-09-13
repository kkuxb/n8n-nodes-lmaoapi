export type ImageFailureStage =
	| 'generation_request'
	| 'response_parse'
	| 'url_validation'
	| 'download'
	| 'image_format'
	| 'binary_output'
	| 'cancelled';

export type DownloadAttempt = {
	attempt: number;
	durationMs: number;
	timeoutMs: number;
	statusCode?: number;
	errorCode?: string;
	errorName?: string;
	contentType?: string;
	bytes?: number;
	requestId?: string;
	retryable: boolean;
};

export type ImageDiagnostics = {
	stage: ImageFailureStage;
	imageUrl?: string;
	downloadHost?: string;
	generationStatusCode?: number;
	generationRequestId?: string;
	errorCode?: string;
	attempts?: DownloadAttempt[];
	elapsedMs?: number;
	stopReason?: 'attempt_limit' | 'time_budget' | 'non_retryable' | 'cancelled';
};

export class GptImageError extends Error {
	constructor(
		message: string,
		public readonly diagnostics: ImageDiagnostics,
	) {
		super(message);
		this.name = 'GptImageError';
	}
}

export function asObject(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function safeToken(value: unknown): string | undefined {
	return typeof value === 'string' && /^[\w.-]{1,160}$/.test(value) ? value : undefined;
}

export function responseStatus(value: unknown): number | undefined {
	const object = asObject(value);
	const status = object.statusCode ?? object.status;
	return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
		? status
		: undefined;
}

export function headerValue(headers: unknown, name: string): string | undefined {
	const entry = Object.entries(asObject(headers)).find(([key]) => key.toLowerCase() === name);
	return typeof entry?.[1] === 'string' ? entry[1] : undefined;
}

export function responseRequestId(headers: unknown): string | undefined {
	return safeToken(
		headerValue(headers, 'x-request-id') ??
			headerValue(headers, 'x-oneapi-request-id') ??
			headerValue(headers, 'x-amz-request-id'),
	);
}

export function recoverableImageUrl(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	try {
		const url = new URL(value);
		if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return value;
	} catch {
		/* The caller reports invalid URLs without persisting embedded credentials. */
	}
	return undefined;
}
