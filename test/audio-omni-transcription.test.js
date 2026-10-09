const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
	transcribeChunks,
	parseTranscript,
} = require('../dist/nodes/MaibaoApi/audio/OmniTranscription');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node');
const ok = (segments) => ({
	choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ segments }) } }],
});
const chunks = (n) =>
	Array.from({ length: n }, (_, index) => ({
		index,
		bytes: Buffer.from([index]),
		startSeconds: index * 30,
		durationSeconds: 30,
		ownedStartSeconds: index * 30,
		ownedEndSeconds: (index + 1) * 30,
	}));
const noWait = { sleep: async () => {} };

test('three workers finish out of order without changing output order or exceeding concurrency', async () => {
	let active = 0,
		maximum = 0;
	const out = await transcribeChunks(chunks(8), async (body) => {
		const index = Buffer.from(
			body.messages[0].content[1].input_audio.data.split(',')[1],
			'base64',
		)[0];
		active++;
		maximum = Math.max(maximum, active);
		await new Promise((resolve) => setTimeout(resolve, index % 3 === 0 ? 12 : 2));
		active--;
		return ok([{ start: 0.1, end: 1.2, text: `句子${index}` }]);
	});
	assert.equal(maximum, 3);
	assert.equal(out.split('\n').length, 8);
	assert.ok(out.indexOf('句子0') < out.indexOf('句子1'));
	assert.match(out, /\[00:30–00:32\]/);
});

test('retry only the failed chunk; invalid JSON receives one correction attempt', async () => {
	let calls = 0;
	assert.equal(
		await transcribeChunks(
			chunks(1),
			async () => {
				if (++calls === 1) throw { statusCode: 429 };
				return ok([]);
			},
			noWait,
		),
		'',
	);
	assert.equal(calls, 2);
	calls = 0;
	const prompts = [];
	await transcribeChunks(
		chunks(1),
		async (body) => {
			prompts.push(body.messages[0].content[0].text);
			return ++calls === 1
				? { choices: [{ finish_reason: 'stop', message: { content: 'broken' } }] }
				: ok([]);
		},
		noWait,
	);
	assert.equal(calls, 2);
	assert.match(prompts[1], /previous response was invalid/);
	calls = 0;
	await assert.rejects(
		transcribeChunks(
			chunks(1),
			async () => {
				calls++;
				return ok([{ start: 20, end: 40, text: 'bad' }]);
			},
			noWait,
		),
		/0.0–30.0/,
	);
	assert.equal(calls, 2);
});

test('permanent failures and account balance errors do not retry or leak response secrets', async () => {
	for (const error of [
		{ statusCode: 401, message: 'secret' },
		{ statusCode: 403 },
		{ statusCode: 429, message: 'insufficient balance' },
	]) {
		let calls = 0;
		await assert.rejects(
			transcribeChunks(
				chunks(1),
				async () => {
					calls++;
					throw error;
				},
				noWait,
			),
			(e) => !e.message.includes('secret'),
		);
		assert.equal(calls, 1);
	}
});

test('cancellation, bounded hangs and total budget stop dispatch', async () => {
	const controller = new AbortController();
	let calls = 0;
	await assert.rejects(
		transcribeChunks(
			chunks(10),
			async () => {
				calls++;
				controller.abort();
				return ok([]);
			},
			{ signal: controller.signal },
		),
		/取消/,
	);
	assert.ok(calls <= 3);
	await assert.rejects(
		transcribeChunks(chunks(1), async () => new Promise(() => {}), {
			attemptMs: 5,
			budgetMs: 30,
			sleep: async () => {},
		}),
		/失败/,
	);
	let clock = 0;
	await assert.rejects(
		transcribeChunks(
			chunks(1),
			async () => {
				clock = 101;
				return ok([]);
			},
			{ now: () => clock, budgetMs: 100 },
		),
		/失败/,
	);
});

test('parser rejects truncated, out-of-order or invalid numeric intervals and accepts silence', () => {
	assert.deepEqual(parseTranscript(ok([]), 30), []);
	for (const segments of [
		[{ start: -1, end: 1, text: 'bad' }],
		[{ start: 0, end: 0, text: 'bad' }],
		[{ start: 1, end: 2, text: '' }],
		[
			{ start: 2, end: 3, text: 'a' },
			{ start: 1, end: 2, text: 'b' },
		],
	])
		assert.throws(() => parseTranscript(ok(segments), 30));
	assert.throws(() => parseTranscript({ choices: [{ finish_reason: 'length' }] }, 30));
});

test('node hides legacy controls and outputs text only for multiple items, preserving pairing', async () => {
	const tone = fs.readFileSync(path.join(__dirname, 'fixtures/audio/tone.m4a'));
	const node = new MaibaoApi();
	for (const name of ['audioLanguage', 'audioResponseFormat'])
		assert.equal(node.description.properties.find((p) => p.name === name).type, 'hidden');
	const context = {
		getInputData: () =>
			[0, 1].map(() => ({
				json: {},
				binary: {
					data: { fileName: 'tone.m4a', mimeType: 'audio/mp4', data: tone.toString('base64') },
				},
			})),
		getNodeParameter: (name, index, fallback) =>
			({ mode: 'audio', audioLanguage: 'zh', audioResponseFormat: 'text' })[name] ?? fallback,
		getCredentials: async () => ({ apiKey: 'test', baseUrl: 'https://example.test/v1' }),
		getNode: () => ({ name: 'test', type: 'maibaoApi', parameters: {} }),
		continueOnFail: () => false,
		helpers: {
			httpRequest: async (options) => {
				assert.match(options.url, /chat\/completions$/);
				assert.equal(options.body.model, 'qwen3.5-omni-flash');
				return ok([{ start: 0, end: 1, text: 'hello' }]);
			},
		},
	};
	const [out] = await node.execute.call(context);
	assert.equal(out.length, 2);
	out.forEach((item, i) => {
		assert.deepEqual(Object.keys(item.json), ['text']);
		assert.deepEqual(item.pairedItem, { item: i });
	});
	context.getInputData = () => [{ json: {} }];
	context.continueOnFail = () => true;
	const [failed] = await node.execute.call(context);
	assert.match(failed[0].json.error, /未找到音频/);
	assert.deepEqual(failed[0].pairedItem, { item: 0 });
});
