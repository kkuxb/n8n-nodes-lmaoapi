const test = require('node:test');
const assert = require('node:assert/strict');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');
const { resolveGptImageResponse } = require('../dist/nodes/MaibaoApi/GptImageResponse.js');
const { GPT_IMAGE_MODELS } = require('../dist/nodes/MaibaoApi/GptImageUtils.js');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const imageUrl = 'https://images.example.test/generated?signature=private-signature';

async function execute({ model = 'gpt-image-2', body, download = png, references = false, parameters = {}, continueOnFail = false, prepareError, generationError }) {
	const calls = [];
	const prepared = [];
	const params = { mode: 'image', imageModel: model, imageSize: '1024x1024', userPrompt: 'test', imageQuality: 'auto', imageOutputFormat: 'png', ...parameters };
	const context = {
		getInputData: () => [{ json: {}, ...(references ? { binary: { data: { data: png.toString('base64'), mimeType: 'image/png', fileName: 'reference.png' } } } : {}) }],
		getCredentials: async () => ({ apiKey: 'private-api-key', baseUrl: 'https://api.example.test/v1' }),
		getNodeParameter: (name, index, fallback) => params[name] ?? fallback,
		getNode: () => ({ name: 'MaibaoAPI', type: 'n8n-nodes-maibaoapi.maibaoApi', typeVersion: 1, position: [0, 0], parameters: params }),
		continueOnFail: () => continueOnFail,
		helpers: {
			getBinaryDataBuffer: async () => png,
			httpRequest: async options => {
				calls.push(options);
				if (options.method === 'GET') {
					if (typeof download === 'function') return download(options, calls);
					if (download instanceof Error) throw download;
					return { body: download, statusCode: 200, headers: { 'content-type': 'image/png' } };
				}
				if (generationError) throw generationError;
				assert.equal(options.returnFullResponse, true);
				return { body, statusCode: 200, headers: { 'x-oneapi-request-id': 'diagnostic-request-id' } };
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => {
				if (prepareError) throw prepareError;
				prepared.push({ buffer, fileName, mimeType });
				return { data: buffer.toString('base64'), fileName, mimeType };
			},
		},
	};
	try {
		const [output] = await new MaibaoApi().execute.call(context);
		return { output, calls, prepared };
	} catch (error) {
		return { error, calls, prepared };
	}
}

for (const model of GPT_IMAGE_MODELS) {
	for (const references of [false, true]) {
		test(`${model} ${references ? '编辑' : '生图'}：URL 自动下载并同时输出图片与链接`, async () => {
			const result = await execute({ model, references, body: { data: [{ url: imageUrl }] } });
			assert.equal(result.error, undefined);
			assert.equal(result.calls.length, 2);
			const [post, get] = result.calls;
			assert.equal(post.url, `https://api.example.test/v1/images/${references ? 'edits' : 'generations'}`);
			assert.equal(references ? post.body.get('model') : post.body.model, `${model}-c`);
			assert.equal(get.url, imageUrl);
			assert.equal(get.encoding, 'arraybuffer');
			assert.equal(get.headers, undefined);
			assert.equal(get.auth, undefined);
			assert.deepEqual(result.prepared[0].buffer, png);
			assert.equal(result.output[0].json.imageUrl, imageUrl);
			assert.equal(result.output[0].json.hasReferenceImages, references);
			assert.equal(result.output[0].binary.data.mimeType, 'image/png');
			assert.deepEqual(result.output[0].pairedItem, { item: 0 });
		});
	}
}

test('Base64 保持旧输出；两字段并存时保留 URL 且不再下载', async () => {
	for (const url of [undefined, imageUrl]) {
		const result = await execute({ body: { data: [{ b64_json: png.toString('base64'), ...(url ? { url } : {}) }] } });
		assert.equal(result.error, undefined);
		assert.equal(result.calls.length, 1);
		assert.deepEqual(result.prepared[0].buffer, png);
		assert.equal(result.output[0].json.imageUrl, url);
		assert.equal('imageUrl' in result.output[0].json, !!url);
	}
});

test('节点中重试耗尽或最终成功，均只有一次生图 POST', async t => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	for (const eventualSuccess of [false, true]) {
		let attempts = 0;
		let done = false;
		const pending = execute({ body: { data: [{ url: imageUrl }] }, download: async () => {
			if (++attempts === 4 && eventualSuccess) return { body: png, statusCode: 200, headers: {} };
			throw Object.assign(new Error('private-api-key'), { code: 'ECONNRESET' });
		} }).finally(() => { done = true; });
		for (let ticks = 0; !done && ticks < 100; ticks++) {
			t.mock.timers.tick(250);
			await new Promise(resolve => setImmediate(resolve));
		}
		assert.equal(done, true);
		const result = await pending;
		assert.equal(result.calls.filter(c => c.method === 'POST').length, 1);
		assert.equal(result.calls.filter(c => c.method === 'GET').length, 4);
		if (eventualSuccess) assert.equal(result.output[0].json.status, 'success');
		else {
			assert.equal(result.error.context.imageDownload.attempts.length, 4);
			assert.equal(result.error.context.imageDownload.imageUrl, imageUrl);
			assert.doesNotMatch(JSON.stringify(result.error), /private-api-key/);
		}
	}
});

test('下载失败保留生图请求 ID，不泄露签名或密钥、不重复 POST', async () => {
	const result = await execute({ body: { data: [{ url: imageUrl }] }, download: new Error(`failed ${imageUrl}`) });
	assert.match(result.error.message, /图片已生成.*下载失败/);
	assert.match(result.error.message, /diagnostic-request-id/);
	assert.doesNotMatch(result.error.message, /private-signature|private-api-key/);
	assert.deepEqual(result.calls.map(c => c.method), ['POST', 'GET']);
	assert.equal(result.prepared.length, 0);
});

test('HTTP 200 HTML/空文件下载不能伪装成成功图片', async () => {
	for (const download of [Buffer.from('<html>Access denied</html>'), Buffer.alloc(0)]) {
		const result = await execute({ body: { data: [{ url: imageUrl }] }, download });
		assert.match(result.error.message, /下载内容不是图片/);
		assert.equal(result.prepared.length, 0);
	}
});

test('缺少图像、业务错误、非 JSON 返回分别说明失败原因', async () => {
	for (const [body, pattern] of [
		[{ data: [] }, /没有可用的 b64_json 或 url/],
		[{ error: { code: 'moderation_blocked', message: 'secret' } }, /业务错误.*moderation_blocked/],
		['<html>error</html>', /无法解析的 JSON/],
	]) {
		const result = await execute({ body });
		assert.match(result.error.message, pattern);
		assert.equal(result.calls.length, 1);
	}
});

test('标准 JSON 字符串可解析；无效 Base64 和 URL 不发起下载', async () => {
	const result = await resolveGptImageResponse(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), () => assert.fail('unexpected download'));
	assert.deepEqual(result.buffer, png);
	for (const item of [{ b64_json: '%%%invalid' }, { url: 'file:///etc/passwd' }, { url: 'https://user:pass@example.test/image.png' }]) {
		await assert.rejects(resolveGptImageResponse({ data: [item] }, () => assert.fail('unexpected download')));
	}
});

test('真实 PNG 内容决定扩展名和 MIME，避免供应商忽略格式参数时误标', async () => {
	const result = await execute({ body: { data: [{ url: imageUrl }] }, parameters: { imageOutputFormat: 'webp' } });
	assert.equal(result.prepared[0].mimeType, 'image/png');
	assert.equal(result.prepared[0].fileName, 'gpt_image_2.png');
});

test('仅新模型透传背景；透明 JPEG 在付费请求前拒绝', async () => {
	const body = { data: [{ b64_json: png.toString('base64') }] };
	for (const model of GPT_IMAGE_MODELS) {
		const result = await execute({ model, body, parameters: { imageBackground: 'transparent' } });
		assert.equal(result.calls[0].body.background, model === 'gpt-image-2' ? 'auto' : 'transparent');
	}
	const result = await execute({ model: 'gpt-image-2.5-flare', body, parameters: { imageBackground: 'transparent', imageOutputFormat: 'jpeg' } });
	assert.match(result.error.message, /透明背景仅支持/);
	assert.equal(result.calls.length, 0);
});

test('continueOnFail 保持错误输出与 item 关联', async () => {
	const result = await execute({ body: { data: [] }, continueOnFail: true });
	assert.match(result.output[0].json.error, /未返回图像/);
	assert.deepEqual(result.output[0].pairedItem, { item: 0 });
});

test('旧工作流中的已移除模型会提示重新选择，不发送生图请求', async () => {
	for (const model of ['gemini-3-pro-image-preview', 'doubao-seedream-5-0-260128']) {
		const result = await execute({ model, body: {} });
		assert.match(result.error.message, /已移除或不受支持.*重新选择/);
		assert.equal(result.calls.length, 0);
	}
});


test('错误详情和 continueOnFail 保留恢复 URL，错误消息不含完整签名', async () => {
	for (const continueOnFail of [false, true]) {
		const result = await execute({ body: { data: [{ url: imageUrl }] }, download: new Error(imageUrl), continueOnFail });
		const diagnostics = continueOnFail ? result.output[0].json.imageDownload : JSON.parse(JSON.stringify(result.error)).context.imageDownload;
		assert.equal(diagnostics.imageUrl, imageUrl);
		assert.equal(diagnostics.stage, 'download');
		assert.equal(diagnostics.generationStatusCode, 200);
		assert.equal(diagnostics.generationRequestId, 'diagnostic-request-id');
		assert.equal(diagnostics.attempts[0].statusCode, undefined);
		assert.equal(diagnostics.attempts[0].timeoutMs, 20000);
		if (continueOnFail) assert.equal(result.output[0].json.imageUrl, imageUrl);
		else { assert.doesNotMatch(result.error.message, /private-signature/); assert.match(result.error.description, /imageUrl/); }
	}
});

test('Binary 写入错误保留 URL，与下载或格式错误分开', async () => {
	const result = await execute({ body: { data: [{ url: imageUrl }] }, prepareError: new Error('private-api-key') });
	assert.equal(result.error.context.imageDownload.stage, 'binary_output');
	assert.equal(result.error.context.imageDownload.imageUrl, imageUrl);
	assert.equal(result.error.context.imageDownload.attempts[0].statusCode, 200);
	assert.doesNotMatch(result.error.message, /private-api-key|下载失败/);
	assert.deepEqual(result.calls.map(c => c.method), ['POST', 'GET']);
});

test('生图 HTTP 503 与下载 HTTP 503 分开记录，不泄漏原始响应', async () => {
	const result = await execute({ generationError: Object.assign(new Error(imageUrl), {
		code: 'ERR_BAD_RESPONSE', response: { status: 503, headers: { 'x-request-id': 'generation-503' }, data: 'private-api-key' },
	}) });
	assert.equal(result.error.context.imageDownload.stage, 'generation_request');
	assert.equal(result.error.context.imageDownload.generationStatusCode, 503);
	assert.match(result.error.message, /生图 HTTP 503/);
	assert.doesNotMatch(JSON.stringify(result.error), /private-signature|private-api-key/);
	assert.equal(result.calls.length, 1);
});
