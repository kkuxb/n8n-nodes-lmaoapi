const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { MaibaoApi: Credential } = require('../dist/credentials/MaibaoApi.credentials.js');
const { MaibaoApi: Node } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

const addressCases = [
	[undefined, 'https://ai.lmao.net.cn/v1'],
	['https://ai.lmao.net.cn/v1', 'https://ai.lmao.net.cn/v1'],
	['https://api.lmao.net.cn/v1', 'https://api.lmao.net.cn/v1'],
	['https://api.lmao.net.cn', 'https://api.lmao.net.cn/v1'],
	[' https://api.lmao.net.cn/v1/// ', 'https://api.lmao.net.cn/v1'],
	['https://custom.example.test', 'https://custom.example.test/v1'],
];

async function captureTextRequest(credentials) {
	let request;
	const parameters = {
		mode: 'text',
		userPrompt: 'test',
		modelId: 'test-model',
		systemPrompt: 'system',
		binarySourceMode: 'current',
		sourceNodeNames: '',
	};
	await new Node().execute.call({
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiKey: 'test-key', ...credentials }),
		getNodeParameter: (name, _index, defaultValue) => parameters[name] ?? defaultValue,
		helpers: {
			httpRequest: async (options) => {
				request = options;
				return { choices: [] };
			},
		},
		continueOnFail: () => false,
	});
	return request;
}

test('credential checks and node requests normalize both domains and saved legacy URLs consistently', async () => {
	const credential = new Credential();
	const expression = credential.test.request.baseURL;
	assert.equal(credential.test.request.url, '/models');
	for (const [lmaoBaseUrl, expected] of addressCases) {
		const actual = vm.runInNewContext(expression.slice(3, -2), {
			$credentials: { lmaoBaseUrl },
		});
		assert.equal(actual, expected);
		const request = await captureTextRequest({ lmaoBaseUrl });
		assert.equal(request.url, `${expected}/chat/completions`);
		assert.equal(request.headers.Authorization, 'Bearer test-key');
	}
});

test('legacy upstream domains fall back to LmaoAPI while saved custom gateways remain usable', async () => {
	for (const baseUrl of ['https://api.maibao.chat/v1', 'https://ai.maibao.chat/v1']) {
		const request = await captureTextRequest({ baseUrl });
		assert.equal(request.url, 'https://ai.lmao.net.cn/v1/chat/completions');
	}
	const legacy = await captureTextRequest({ baseUrl: 'https://legacy.example.test/v1' });
	assert.equal(legacy.url, 'https://legacy.example.test/v1/chat/completions');
	const selected = await captureTextRequest({
		baseUrl: 'https://legacy.example.test/v1',
		lmaoBaseUrl: 'https://api.lmao.net.cn/v1',
	});
	assert.equal(selected.url, 'https://api.lmao.net.cn/v1/chat/completions');
});
