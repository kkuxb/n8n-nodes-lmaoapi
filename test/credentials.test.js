const test = require('node:test');
const assert = require('node:assert/strict');

const { MaibaoApi } = require('../dist/credentials/MaibaoApi.credentials.js');

test('凭证页面仅需填写 API Key，凭证测试固定使用 AI 域名', () => {
	const credential = new MaibaoApi();

	assert.deepEqual(credential.properties.map((property) => property.name), ['apiKey']);
	assert.equal(credential.properties[0].required, true);
	assert.equal(credential.properties[0].typeOptions.password, true);
	assert.equal(credential.test.request.baseURL, 'https://ai.lmao.net.cn/v1');
	assert.equal(credential.test.request.url, '/models');
	assert.equal(credential.test.request.headers.Authorization, '=Bearer {{$credentials.apiKey}}');
});

test('新凭证与保存旧地址的凭证均使用固定 AI 域名执行请求', async () => {
	const { MaibaoApi: MaibaoNode } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

	for (const credentials of [
		{ apiKey: 'test-key' },
		{ apiKey: 'test-key', baseUrl: 'https://api.lmao.net.cn/v1' },
	]) {
		const requests = [];
		const parameters = { mode: 'text', userPrompt: 'hello', modelId: 'test-model', systemPrompt: '' };
		const context = {
			getInputData: () => [{ json: {} }],
			getCredentials: async () => credentials,
			getNodeParameter: (name, index, fallback) => parameters[name] ?? fallback,
			continueOnFail: () => false,
			helpers: {
				httpRequest: async (options) => {
					requests.push(options);
					return { choices: [] };
				},
			},
		};

		await new MaibaoNode().execute.call(context);
		assert.equal(requests.length, 1);
		assert.equal(requests[0].url, 'https://ai.lmao.net.cn/v1/chat/completions');
		assert.equal(requests[0].headers.Authorization, 'Bearer test-key');
	}
});
