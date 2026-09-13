const test = require('node:test');
const assert = require('node:assert/strict');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');
const { resolveGptImageResponse } = require('../dist/nodes/MaibaoApi/GptImageResponse.js');
const { GPT_IMAGE_MODELS } = require('../dist/nodes/MaibaoApi/GptImageUtils.js');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const imageUrl = 'https://images.example.test/generated?signature=private-signature';

async function execute({ model = 'gpt-image-2', body, download = png, references = false, parameters = {}, continueOnFail = false }) {
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
					if (download instanceof Error) throw download;
					return download;
				}
				assert.equal(options.returnFullResponse, true);
				return { body, statusCode: 200, headers: { 'x-oneapi-request-id': 'diagnostic-request-id' } };
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => {
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
