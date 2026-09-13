const test = require('node:test');
const assert = require('node:assert/strict');
const { downloadGptImage } = require('../dist/nodes/MaibaoApi/GptImageDownload.js');

const url = 'https://images.example.test/image?signature=private';
const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
const ok = { body: png, statusCode: 200, headers: { 'content-type': 'image/png' } };

function clock() {
	let time = 0;
	const waits = [];
	return {
		waits, advance: ms => { time += ms; },
		runtime: { now: () => time, wallNow: () => 0, random: () => 0, sleep: async ms => { waits.push(ms); time += ms; } },
	};
}

test('首次下载加三次重试；20 秒单次限制和等待共同受 80 秒预算约束', async () => {
	const c = clock(); const timeouts = [];
	await assert.rejects(downloadGptImage(url, async (sameUrl, timeout, signal) => {
		assert.equal(sameUrl, url); assert.equal(signal.aborted, false);
		timeouts.push(timeout); c.advance(timeout);
		throw Object.assign(new Error('private raw transport error'), { code: 'ETIMEDOUT' });
	}, c.runtime), error => {
		assert.equal(error.diagnostics.stopReason, 'time_budget');
		assert.equal(error.diagnostics.elapsedMs, 80000);
		assert.equal(error.diagnostics.attempts.length, 4);
		assert.equal(error.diagnostics.imageUrl, url);
		assert.doesNotMatch(error.message, /signature|private/);
		return true;
	});
	assert.deepEqual(timeouts, [20000, 20000, 20000, 3000]);
	assert.deepEqual(c.waits, [2000, 5000, 10000]);
});

test('连接暂时中断后复用 URL 成功，保留每次状态和耗时', async () => {
	const c = clock(); let count = 0;
	const result = await downloadGptImage(url, async () => {
		c.advance(100);
		if (++count < 3) throw Object.assign(new Error('ignored'), { code: 'ECONNRESET' });
		return ok;
	}, c.runtime);
	assert.deepEqual(result.buffer, png);
	assert.equal(result.diagnostics.attempts.length, 3);
	assert.equal(result.diagnostics.attempts[0].errorCode, 'ECONNRESET');
	assert.equal(result.diagnostics.attempts[0].statusCode, undefined);
	assert.equal(result.diagnostics.attempts[2].statusCode, 200);
	assert.equal(result.diagnostics.attempts[2].bytes, png.length);
});

test('瞬时失败最多尝试四次，不用完时间预算也会停止', async () => {
	const c = clock(); let count = 0;
	await assert.rejects(downloadGptImage(url, async () => {
		count++; throw Object.assign(new Error('ignored'), { code: 'EAI_AGAIN' });
	}, c.runtime), e => e.diagnostics.stopReason === 'attempt_limit');
	assert.equal(count, 4);
});

test('读取响应时中断及包装在 cause 中的连接错误仍可重试', async () => {
	for (const error of [
		Object.assign(new Error('stream has been aborted'), { code: 'ERR_BAD_RESPONSE', response: { status: 200 } }),
		Object.assign(new Error('wrapper'), { code: 'ERR_BAD_RESPONSE', cause: { code: 'ECONNRESET' } }),
	]) {
		let count = 0; const c = clock();
		const result = await downloadGptImage(url, async () => { if (++count === 1) throw error; return ok; }, c.runtime);
		assert.equal(count, 2); assert.equal(result.diagnostics.attempts[0].retryable, true);
	}
});

test('HTTP 429 的 Retry-After 在预算内生效，超预算不提前重试', async () => {
	const c = clock(); let count = 0;
	await downloadGptImage(url, async () => ++count === 1
		? { body: Buffer.from('busy'), statusCode: 429, headers: { 'Retry-After': '10' } } : ok, c.runtime);
	assert.deepEqual(c.waits, [10000]);
	const c2 = clock(); count = 0;
	await assert.rejects(downloadGptImage(url, async () => {
		count++; return { body: Buffer.from('busy'), statusCode: 503, headers: { 'retry-after': '120' } };
	}, c2.runtime), e => e.diagnostics.stopReason === 'time_budget');
	assert.equal(count, 1); assert.deepEqual(c2.waits, []);
});

test('Retry-After 支持 HTTP 日期；忽略无效值', async () => {
	for (const [value, delay] of [['Thu, 01 Jan 1970 00:00:08 GMT', 8000], ['not-a-date', 2000]]) {
		const c = clock(); let count = 0;
		await downloadGptImage(url, async () => ++count === 1
			? { ...ok, statusCode: 503, headers: { 'retry-after': value } } : ok, c.runtime);
		assert.deepEqual(c.waits, [delay]);
	}
});

test('403/404 和证书错误不重试；HTTP 错误只保存脱敏元数据', async () => {
	for (const failure of [
		{ code: 'ERR_BAD_REQUEST', response: { status: 403, data: '<Error>private</Error>', headers: { 'content-type': 'application/xml', 'x-amz-request-id': 's3-request' } } },
		{ response: { status: 404 } }, { code: 'CERT_HAS_EXPIRED' },
	]) {
		const c = clock(); let count = 0;
		await assert.rejects(downloadGptImage(url, async () => { count++; throw Object.assign(new Error(url), failure); }, c.runtime), e => {
			assert.equal(e.diagnostics.stopReason, 'non_retryable');
			assert.equal(e.diagnostics.attempts[0].statusCode, failure.response?.status);
			assert.equal(e.cause, undefined); assert.doesNotMatch(e.message, /signature|private/);
			assert.doesNotMatch(JSON.stringify(e.diagnostics.attempts), /private/);
			return true;
		});
		assert.equal(count, 1); assert.deepEqual(c.waits, []);
	}
});

test('取消进行中的请求，不依赖底层 transport 主动 reject', async () => {
	const controller = new AbortController(); let signal;
	const pending = downloadGptImage(url, async (_url, _timeout, s) => {
		signal = s; queueMicrotask(() => controller.abort());
		return new Promise(() => {});
	}, { signal: controller.signal });
	await assert.rejects(pending, e => e.diagnostics.stage === 'cancelled');
	assert.equal(signal.aborted, true);
});

test('取消退避等待或预先取消均不启动下一次下载', async () => {
	const controller = new AbortController(); const c = clock(); let count = 0;
	c.runtime.signal = controller.signal;
	c.runtime.sleep = async () => { controller.abort(); throw new Error('cancelled'); };
	await assert.rejects(downloadGptImage(url, async () => { count++; throw { code: 'ECONNRESET' }; }, c.runtime), e => e.diagnostics.stage === 'cancelled');
	assert.equal(count, 1);
	await assert.rejects(downloadGptImage(url, () => assert.fail('no request after cancel'), c.runtime), e => e.diagnostics.stage === 'cancelled');
});

test('独立截止计时中止忽略 timeout 的 transport', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const controller = new AbortController(); let requestSignal;
	const pending = downloadGptImage(url, async (_url, _timeout, signal) => {
		requestSignal = signal; return new Promise(() => {});
	}, { signal: controller.signal });
	await Promise.resolve();
	t.mock.timers.tick(20000);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(requestSignal.aborted, true);
	controller.abort();
	await assert.rejects(pending, e => e.diagnostics.stage === 'cancelled');
});
