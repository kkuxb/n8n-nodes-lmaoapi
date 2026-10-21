const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { MaibaoApi: Credential } = require('../dist/credentials/MaibaoApi.credentials.js');
const { MaibaoApi: Node } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

const fixedBase = 'https://ai.lmao.net.cn/v1';
const oldAddresses = [
	undefined,
	'https://ai.lmao.net.cn/v1',
	'https://api.lmao.net.cn/v1',
	'https://api.lmao.net.cn',
	' https://api.lmao.net.cn/v1/// ',
	'https://api.maibao.chat/v1',
	'https://ai.maibao.chat/v1',
	'https://custom.example.test/v1',
];

async function captureRequests(credentials, parameters, binary) {
	const requests = [];
	await new Node().execute.call({
		getInputData: () => [{ json: {}, ...(binary ? { binary } : {}) }],
		getCredentials: async () => ({ apiKey: 'test-key', ...credentials }),
		getNodeParameter: (name, _index, fallback) => parameters[name] ?? fallback,
		getNode: () => ({ name: 'test', type: 'lmaoApi', parameters: {} }),
		continueOnFail: () => true,
		helpers: {
			httpRequest: async (options) => {
				requests.push(options);
				// Stop at the API boundary; an auth failure must never trigger another gateway.
				throw Object.assign(new Error('Test authentication failure'), { statusCode: 401 });
			},
		},
	});
	return requests;
}

function assertRoute(requests, url, authorization = 'Bearer test-key') {
	assert.equal(requests.length, 1);
	assert.equal(requests[0].url, url);
	assert.equal(requests[0].headers.Authorization, authorization);
}

test('credential exposes only API Key and tests the fixed AI address', () => {
	const credential = new Credential();
	assert.equal(credential.name, 'lmaoApi');
	assert.deepEqual(credential.properties.map(p => p.name), ['apiKey']);
	assert.equal(credential.test.request.baseURL, fixedBase);
	assert.equal(credential.test.request.url, '/models');
});

test('new credentials and both legacy address fields always route to the AI address', async () => {
	for (const field of ['lmaoBaseUrl', 'baseUrl']) {
		for (const address of oldAddresses) {
			assertRoute(await captureRequests({ [field]: address }, {
				mode: 'text', userPrompt: 'test', modelId: 'test-model', systemPrompt: '',
			}), fixedBase + '/chat/completions');
		}
	}
});

test('image, audio and hidden legacy modes ignore retired and custom credential addresses', async () => {
	const credentials = {
		lmaoBaseUrl: 'https://api.lmao.net.cn/v1',
		baseUrl: 'https://custom.example.test/v1',
	};
	const tone = fs.readFileSync(path.join(__dirname, 'fixtures/audio/tone.m4a'));
	for (const [parameters, endpoint, binary] of [
		[{ mode: 'image', imageModel: 'gpt-image-2', imageSize: '1024x1024', userPrompt: 'test' }, '/v1/images/generations'],
		[{ mode: 'image', imageModel: 'gemini-nano-banana-2.1-preview', imageSize: '1K', aspectRatio: '1:1', userPrompt: 'test' }, '/v1beta/models/gemini-nano-banana-2.1-preview:generateContent'],
		[{ mode: 'audio' }, '/v1/chat/completions', { data: { fileName: 'tone.m4a', mimeType: 'audio/mp4', data: tone.toString('base64') } }],
		[{ mode: 'video', videoOperation: 'list' }, '/v1/videos'],
		[{ mode: 'embeddings', embeddingModel: 'text-embedding-3-small', embeddingInput: 'test' }, '/v1/embeddings'],
	]) {
		assertRoute(await captureRequests(credentials, parameters, binary), 'https://ai.lmao.net.cn' + endpoint,
			parameters.mode === 'video' ? 'test-key' : 'Bearer test-key');
	}
});

test('video understanding uses the fixed AI gateway with new or saved credentials and keeps keys off the media host', async () => {
	const box = (type, ...parts) => {
		const body = Buffer.concat(parts);
		const header = Buffer.alloc(8);
		header.writeUInt32BE(body.length + 8);
		header.write(type, 4);
		return Buffer.concat([header, body]);
	};
	const mvhd = Buffer.alloc(20);
	mvhd.writeUInt32BE(1000, 12);
	mvhd.writeUInt32BE(5000, 16);
	const hdlr = Buffer.alloc(12);
	hdlr.write('vide', 8);
	const media = Buffer.concat([
		box('ftyp', Buffer.alloc(16)),
		box('moov', box('mvhd', mvhd), box('trak', box('mdia', box('hdlr', hdlr)))),
		box('mdat', Buffer.alloc(8)),
	]);
	for (const saved of [{}, {
		lmaoBaseUrl: 'https://api.lmao.net.cn/v1',
		baseUrl: 'https://custom.example.test/v1',
	}]) {
		const apiRequests = [];
		let mediaRequests = 0;
		const [items] = await new Node().execute.call({
			getInputData: () => [{ json: {} }],
			getCredentials: async () => ({ apiKey: 'test-key', ...saved }),
			getNodeParameter: (name, _index, fallback) => ({
				mode: 'videoUnderstanding', videoUnderstandingUrl: 'https://media.example.com/video.mp4?signature=test',
			})[name] ?? fallback,
			getNode: () => ({ name: 'test', type: 'lmaoApi', parameters: {} }),
			continueOnFail: () => true,
			helpers: {
				httpRequest: async options => {
					if (options.method === 'GET') {
						mediaRequests++;
						assert.equal(options.headers.Authorization, undefined);
						const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
						const last = Math.min(Number(end), media.length - 1);
						return {
							statusCode: 206,
							headers: { 'content-range': `bytes ${start}-${last}/${media.length}` },
							body: Readable.from([media.subarray(Number(start), last + 1)]),
						};
					}
					apiRequests.push(options);
					throw Object.assign(new Error('test-key signature=test'), { statusCode: 401 });
				},
			},
		});
		assert.ok(mediaRequests > 0);
		assertRoute(apiRequests, fixedBase + '/chat/completions');
		assert.equal(JSON.parse(apiRequests[0].body).model, 'qwen3.5-omni-plus');
		assert.doesNotMatch(items[0].json.error, /test-key|signature=test/);
	}
});
