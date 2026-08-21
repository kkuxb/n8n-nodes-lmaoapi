const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { MaibaoApi, pushExecutionData } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

test('统一输出函数保留 JSON 和 Binary 并关联输入 item', () => {
	const returnData = [];
	const binary = {
		data: {
			data: 'ZmFrZS1pbWFnZQ==',
			mimeType: 'image/png',
		},
	};

	pushExecutionData(returnData, 3, {
		json: { status: 'success' },
		binary,
	});

	assert.deepEqual(returnData, [
		{
			json: { status: 'success' },
			binary,
			pairedItem: { item: 3 },
		},
	]);
});

test('文字模式的多个输出分别关联生成它们的输入 item', async () => {
	const node = new MaibaoApi();
	const inputs = [{ json: { text: '第一项' } }, { json: { text: '第二项' } }];
	const context = {
		getInputData: () => inputs,
		getCredentials: async () => ({
			apiKey: 'test-key',
			baseUrl: 'https://api.example.test/v1',
		}),
		getNodeParameter: (name, itemIndex, defaultValue) => {
			const parameters = {
				mode: 'text',
				userPrompt: `提示词 ${itemIndex}`,
				modelId: 'test-model',
				systemPrompt: 'system',
				binarySourceMode: 'current',
				sourceNodeNames: '',
			};

			return parameters[name] ?? defaultValue;
		},
		helpers: {
			httpRequest: async ({ body }) => ({ content: body.messages[1].content }),
		},
		continueOnFail: () => false,
	};

	const [outputs] = await node.execute.call(context);

	assert.deepEqual(
		outputs.map((output) => output.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
	assert.deepEqual(
		outputs.map((output) => output.json.content),
		['提示词 0\n\n[参考文档内容]:\n第一项', '提示词 1\n\n[参考文档内容]:\n第二项'],
	);
});

test('continueOnFail 输出仍关联发生错误的输入 item', async () => {
	const node = new MaibaoApi();
	const context = {
		getInputData: () => [{ json: {} }, { json: {} }],
		getCredentials: async () => ({
			apiKey: 'test-key',
			baseUrl: 'https://api.example.test/v1',
		}),
		getNodeParameter: (name, itemIndex, defaultValue) => {
			const parameters = {
				mode: 'text',
				userPrompt: `提示词 ${itemIndex}`,
				modelId: 'test-model',
				systemPrompt: 'system',
				binarySourceMode: 'current',
				sourceNodeNames: '',
			};

			return parameters[name] ?? defaultValue;
		},
		helpers: {
			httpRequest: async () => {
				throw new Error('request failed');
			},
		},
		continueOnFail: () => true,
	};

	const [outputs] = await node.execute.call(context);

	assert.deepEqual(outputs, [
		{ json: { error: 'request failed' }, pairedItem: { item: 0 } },
		{ json: { error: 'request failed' }, pairedItem: { item: 1 } },
	]);
});

test('execute 中的所有输出都经过统一输出函数', () => {
	const sourcePath = path.join(__dirname, '..', 'nodes', 'MaibaoApi', 'MaibaoApi.node.ts');
	const source = fs.readFileSync(sourcePath, 'utf8');
	const executeSource = source.slice(source.indexOf('\tasync execute('));

	assert.doesNotMatch(executeSource, /returnData\.push\s*\(/);
	assert.match(executeSource, /pushExecutionData\(returnData, i,/);
});
