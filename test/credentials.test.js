const test = require('node:test');
const assert = require('node:assert/strict');

const { MaibaoApi } = require('../dist/credentials/MaibaoApi.credentials.js');

test('API 地址凭证字段提供两个可选域名并默认使用 AI 域名', () => {
	const credential = new MaibaoApi();
	const baseUrl = credential.properties.find((property) => property.name === 'lmaoBaseUrl');

	assert.ok(baseUrl);
	assert.equal(baseUrl.type, 'options');
	assert.deepEqual(baseUrl.options, [
		{
			name: 'https://api.lmao.net.cn',
			value: 'https://api.lmao.net.cn/v1',
		},
		{
			name: 'https://ai.lmao.net.cn',
			value: 'https://ai.lmao.net.cn/v1',
		},
	]);
	assert.equal(baseUrl.default, 'https://ai.lmao.net.cn/v1');
});
