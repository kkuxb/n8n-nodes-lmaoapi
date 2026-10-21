const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
	mp4Duration,
	probeVideo,
	validateVideoUrl,
} = require('../dist/nodes/MaibaoApi/video/VideoMedia');
const {
	videoUnderstandingBody,
	readVideoSse,
	parseVideoSegments,
	renderVideoMarkdown,
} = require('../dist/nodes/MaibaoApi/video/VideoUnderstanding');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node');

function box(type, ...parts) {
	const bytes = Buffer.concat(parts),
		header = Buffer.alloc(8);
	header.writeUInt32BE(bytes.length + 8);
	header.write(type, 4);
	return Buffer.concat([header, bytes]);
}
function movie(duration = 6.125, version = 0, video = true) {
	const mvhd = Buffer.alloc(version ? 32 : 20);
	mvhd[0] = version;
	mvhd.writeUInt32BE(1000, version ? 20 : 12);
	if (version) mvhd.writeBigUInt64BE(BigInt(Math.round(duration * 1000)), 24);
	else mvhd.writeUInt32BE(Math.round(duration * 1000), 16);
	const hdlr = Buffer.alloc(12);
	hdlr.write(video ? 'vide' : 'soun', 8);
	return box('moov', box('mvhd', mvhd), box('trak', box('mdia', box('hdlr', hdlr))));
}
function media() {
	return Buffer.concat([box('ftyp', Buffer.alloc(16)), box('mdat', Buffer.alloc(48)), movie()]);
}
function rangeResponse(options, bytes) {
	const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);
	const start = Number(from),
		end = Math.min(Number(to), bytes.length - 1);
	const part = bytes.subarray(start, end + 1);
	return {
		statusCode: 206,
		headers: { 'content-range': `bytes ${start}-${end}/${bytes.length}` },
		body: Readable.from([part]),
	};
}
function segments(duration = 6.125) {
	return {
		segments: Array.from({ length: Math.ceil(duration / 5) }, (_, i) => ({
			start: String(i * 5),
			end: String(Math.min(i * 5 + 5, duration)),
			visual: '实际画面',
			speech: i ? '' : 'hello',
			screen_text: '',
		})),
	};
}
function sse(value, finish = 'stop', terminal = true) {
	return (
		`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] })}\r\n\r\n` +
		`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\r\n\r\n` +
		(terminal ? 'data: [DONE]\r\n\r\n' : '')
	);
}
const signal = () => new AbortController().signal;

test('MP4 duration supports v0/v1 and rejects absent video, malformed and oversized durations', () => {
	assert.equal(mp4Duration(movie()), 6.125);
	assert.equal(mp4Duration(movie(670.527, 1)), 670.527);
	assert.equal(mp4Duration(movie(901)), 901);
	assert.equal(mp4Duration(movie(3600, 1)), 3600);
	assert.throws(() => mp4Duration(movie(6, 0, false)), /轨道/);
	assert.throws(() => mp4Duration(movie(3600.001)), /1小时/);
	assert.throws(() => mp4Duration(movie(0)), /1小时/);
	assert.throws(() => mp4Duration(movie().subarray(0, 20)), /结构/);
});

test('bounded ranges skip media bytes and handle a validated redirect before metadata', async () => {
	const bytes = media(),
		calls = [];
	const context = {
		helpers: {
			httpRequest: async (options) => {
				calls.push(options);
				if (calls.length === 1)
					return {
						statusCode: 302,
						headers: { location: 'https://media.example.com/final.mp4?sign=keep%2Bvalue' },
						body: Readable.from([]),
					};
				return rangeResponse(options, bytes);
			},
		},
	};
	const out = await probeVideo(
		context,
		'https://bucket.oss-cn-hangzhou.aliyuncs.com/clip.mp4',
		signal(),
	);
	assert.equal(out.duration, 6.125);
	assert.equal(out.url, 'https://media.example.com/final.mp4?sign=keep%2Bvalue');
	assert.equal(calls.length, 5);
	assert.ok(calls.every((o) => o.encoding === 'stream' && o.disableFollowRedirect));
	assert.ok(calls.some((o) => o.headers.Range === 'bytes=80-95'));
});

test('metadata failures do not accept full downloads, incomplete ranges or private redirects', async () => {
	for (const response of [
		{ statusCode: 200, headers: {}, body: Readable.from([media()]) },
		{
			statusCode: 206,
			headers: { 'content-range': 'bytes 0-15/160' },
			body: Readable.from([Buffer.alloc(8)]),
		},
	]) {
		await assert.rejects(
			probeVideo(
				{ helpers: { httpRequest: async () => response } },
				'https://sns-video-v4.xhscdn.com/video.mp4',
				signal(),
			),
			/范围|完整/,
		);
		assert.ok(response.body.destroyed);
	}
	await assert.rejects(
		probeVideo(
			{
				helpers: {
					httpRequest: async () => ({
						statusCode: 302,
						headers: { location: 'https://127.0.0.1/video.mp4' },
						body: Readable.from([]),
					}),
				},
			},
			'https://sns-video-v4.xhscdn.com/video.mp4',
			signal(),
		),
		/私有网络/,
	);
});

test('video URLs reject non-HTTP, embedded credentials and literal private addresses', async () => {
	for (const url of [
		'file:///clip.mp4',
		'https://user:secret@example.test/a',
		'http://localhost/x',
	])
		await assert.rejects(validateVideoUrl(url), /公网/);
	for (const address of ['127.0.0.1', '169.254.169.254', '10.0.0.1', '::1', '::ffff:7f00:1']) {
		const host = address.includes(':') ? `[${address}]` : address;
		await assert.rejects(validateVideoUrl(`https://${host}/video.mp4`), /私有网络/);
	}
});

test('request fixes Plus, full URL and the exact five-second timetable, without Base64 or slicing', () => {
	const body = videoUnderstandingBody(
		'https://sns-video-v4.xhscdn.com/full.mp4?signature=a,b',
		670.527,
	);
	assert.equal(body.model, 'qwen3.5-omni-plus');
	assert.equal(body.stream, true);
	assert.equal(body.max_tokens, 65536);
	assert.equal(
		body.messages[1].content[1].video_url.url,
		'https://sns-video-v4.xhscdn.com/full.mp4?signature=a,b',
	);
	assert.match(body.messages[1].content[0].text, /区间数为135/);
	assert.match(body.messages[1].content[0].text, /\[670,670.527\]/);
	assert.match(videoUnderstandingBody('x', 901).messages[1].content[0].text, /区间数为181/);
	assert.match(videoUnderstandingBody('x', 3600).messages[1].content[0].text, /区间数为720/);
	assert.match(videoUnderstandingBody('x', 3600).messages[1].content[0].text, /\[3595,3600\]/);
	assert.throws(() => videoUnderstandingBody('x', 3600.001), /1小时/);
});

test('2GB size boundary is checked from headers without downloading media', async () => {
	const bytes = Buffer.concat([box('ftyp', Buffer.alloc(16)), movie(3600, 1)]);
	const out = await probeVideo(
		{
			helpers: {
				httpRequest: async (options) => {
					const response = rangeResponse(options, bytes);
					response.headers['content-range'] = response.headers['content-range'].replace(
						/\/\d+$/,
						'/2000000000',
					);
					return response;
				},
			},
		},
		'https://media.example.com/hour.mp4',
		signal(),
	);
	assert.equal(out.duration, 3600);
	let reads = 0,
		requests = 0;
	const body = new Readable({
		read() {
			reads++;
		},
	});
	await assert.rejects(
		probeVideo(
			{
				helpers: {
					httpRequest: async () => {
						requests++;
						return { statusCode: 206, headers: { 'content-range': 'bytes 0-15/2000000001' }, body };
					},
				},
			},
			'https://media.example.com/too-large.mp4',
			signal(),
		),
		/2GB/,
	);
	assert.equal(requests, 1);
	assert.equal(reads, 0);
	assert.ok(body.destroyed);
	assert.equal(parseVideoSegments(JSON.stringify(segments(3600)), 3600).length, 720);
});

test('SSE tolerates arbitrary UTF-8 chunk boundaries and requires stop plus DONE', async () => {
	const raw = Buffer.from(sse(segments()));
	const content = await readVideoSse(
		Readable.from(Array.from(raw, (x) => Buffer.from([x]))),
		signal(),
	);
	assert.equal(JSON.parse(content).segments[0].visual, '实际画面');
	for (const raw of [
		sse(segments(), 'length'),
		sse(segments(), 'stop', false),
		'data: {bad}\n\n',
		'data: {"error":{"message":"SECRET"}}\n\n',
	]) {
		await assert.rejects(
			readVideoSse(Readable.from([raw]), signal()),
			(e) => !e.message.includes('SECRET'),
		);
	}
});

test('SSE cancellation closes a stalled stream and rejects instead of emitting partial output', async () => {
	const stream = new Readable({ read() {} }),
		controller = new AbortController();
	const reading = readVideoSse(stream, controller.signal);
	controller.abort();
	await assert.rejects(reading, /取消/);
	assert.ok(stream.destroyed);
});

test('SSE returns a completed result even when the provider keeps its socket open', async () => {
	const stream = new Readable({ read() {} });
	stream.push(sse(segments()));
	const content = await readVideoSse(stream, signal());
	assert.equal(JSON.parse(content).segments.length, 2);
	assert.ok(stream.destroyed);
});

test('fragmented MP4 metadata with mvex is rejected before model submission', () => {
	const moov = movie();
	const fragmented = box('moov', moov.subarray(8), box('mvex'));
	assert.throws(() => mp4Duration(fragmented), /分片/);
});

test('MP4 extended box sizes are supported and excessive metadata is rejected before reading it', async () => {
	const normal = movie(),
		header = Buffer.alloc(16);
	header.writeUInt32BE(1);
	header.write('moov', 4);
	header.writeBigUInt64BE(BigInt(normal.length + 8), 8);
	assert.equal(mp4Duration(Buffer.concat([header, normal.subarray(8)])), 6.125);
	let calls = 0;
	await assert.rejects(
		probeVideo(
			{
				helpers: {
					httpRequest: async (options) => {
						calls++;
						const offset = calls === 1 ? 0 : 24;
						const data = Buffer.alloc(16);
						data.writeUInt32BE(calls === 1 ? 24 : 9 * 1024 * 1024);
						data.write(calls === 1 ? 'ftyp' : 'moov', 4);
						return {
							statusCode: 206,
							headers: { 'content-range': `bytes ${offset}-${offset + 15}/12000000` },
							body: Readable.from([data]),
						};
					},
				},
			},
			'https://sns-video-v4.xhscdn.com/video.mp4',
			signal(),
		),
		/元数据过大/,
	);
	assert.equal(calls, 2);
});

test('download URLs accept arbitrary domains and public IPs without platform matching', async () => {
	for (const host of [
		'cdn.example.com',
		'bucket.oss-cn-hangzhou.aliyuncs.com',
		'bucket.cos.ap-guangzhou.myqcloud.com',
		'xhscdn.com.example.com',
		'10.example.com',
		'127.example.com',
		'8.8.8.8',
		'[2606:4700:4700::1111]',
	]) {
		const url = `https://${host}/download?signature=a%2Bb&name=clip.mp4`;
		assert.equal(await validateVideoUrl(url), url);
	}
});

test('metadata redirects still reject local addresses and non-HTTP targets', async () => {
	for (const location of [
		'http://10.0.0.1/a.mp4',
		'http://[::1]/a.mp4',
		'http://localhost/a.mp4',
		'https://device.local/a.mp4',
		'file:///a.mp4',
	]) {
		let calls = 0;
		await assert.rejects(
			probeVideo(
				{
					helpers: {
						httpRequest: async () => {
							calls++;
							return {
								statusCode: 302,
								headers: { location },
								body: Readable.from([]),
							};
						},
					},
				},
				'https://sns-video-v4.xhscdn.com/a.mp4',
				signal(),
			),
			/公网|私有网络/,
		);
		assert.equal(calls, 1);
	}
});

test('cancellation racing with metadata headers closes redirect/full-response streams without unhandled errors', async () => {
	for (const statusCode of [200, 302]) {
		const controller = new AbortController(),
			errors = [];
		const body = new Readable({ read() {} });
		body.on('error', (error) => errors.push(error));
		await assert.rejects(
			probeVideo(
				{
					helpers: {
						httpRequest: async () => {
							controller.abort();
							return {
								statusCode,
								headers: { location: 'https://sns-video-v4.xhscdn.com/next.mp4' },
								body,
							};
						},
					},
				},
				'https://sns-video-v4.xhscdn.com/video.mp4',
				controller.signal,
			),
			/取消/,
		);
		await new Promise((resolve) => setImmediate(resolve));
		assert.ok(body.destroyed);
		assert.deepEqual(errors, []);
	}
});

test('parser normalizes numeric strings, rejects incomplete coverage and escapes Markdown', () => {
	const parsed = parseVideoSegments('```json\n' + JSON.stringify(segments()) + '\n```', 6.125);
	assert.equal(parsed[1].end, 6.125);
	assert.match(renderVideoMarkdown(parsed), /\[00:05–00:07\]/);
	assert.match(renderVideoMarkdown(parsed), /口播：无/);
	assert.match(
		renderVideoMarkdown([{ start: 0, end: 1, visual: '<script>*x*', speech: '[link](secret)' }]),
		/&lt;script&gt;\\\*x\\\*/,
	);
	const bad = segments();
	bad.segments[1].start = '4';
	assert.throws(() => parseVideoSegments(JSON.stringify(bad), 6.125), /第2段/);
	assert.throws(() => parseVideoSegments(JSON.stringify({ segments: [] }), 6.125), /全部/);
	assert.throws(
		() => parseVideoSegments(JSON.stringify({ segments: segments().segments.slice(0, 1) }), 6.125),
		/全部/,
	);
});

test('video node outputs text only, preserves item pairing and never sends a key to the media host', async () => {
	const node = new MaibaoApi(),
		bytes = media(),
		requests = [];
	const context = {
		getInputData: () => [{ json: {} }, { json: {} }],
		getNodeParameter: (name, index, fallback) =>
			({
				mode: 'videoUnderstanding',
				videoUnderstandingUrl: `https://assets.example.com/${index}.mp4?sign=keep%2Bvalue`,
			})[name] ?? fallback,
		getCredentials: async () => ({ apiKey: 'private-key' }),
		getNode: () => ({ name: 'test', type: 'maibaoApi', parameters: {} }),
		continueOnFail: () => false,
		helpers: {
			httpRequest: async (options) => {
				requests.push(options);
				if (options.method === 'GET') {
					assert.equal(options.headers.Authorization, undefined);
					return rangeResponse(options, bytes);
				}
				assert.equal(JSON.parse(options.body).model, 'qwen3.5-omni-plus');
				assert.equal(
					JSON.parse(options.body).messages[1].content[1].video_url.url,
					`https://assets.example.com/${requests.filter((x) => x.method === 'POST').length - 1}.mp4?sign=keep%2Bvalue`,
				);
				return { body: Readable.from([sse(segments())]) };
			},
		},
	};
	const [items] = await node.execute.call(context);
	assert.equal(requests.filter((x) => x.method === 'POST').length, 2);
	items.forEach((item, index) => {
		assert.deepEqual(item.pairedItem, { item: index });
		assert.deepEqual(Object.keys(item.json), ['text']);
		assert.match(item.json.text, /画面：实际画面/);
	});
	assert.ok(
		node.description.properties
			.find((p) => p.name === 'mode')
			.options.some((o) => o.value === 'videoUnderstanding'),
	);
	assert.ok(
		!node.description.properties
			.find((p) => p.name === 'sourceNodeNames')
			.displayOptions.show.mode.includes('videoUnderstanding'),
	);
});

test('failed video service calls are not retried and continueOnFail does not leak credentials or signed URLs', async () => {
	const node = new MaibaoApi(),
		bytes = media();
	let posts = 0;
	const context = {
		getInputData: () => [{ json: {} }],
		getCredentials: async () => ({ apiKey: 'private-key' }),
		getNodeParameter: (name, index, fallback) =>
			({
				mode: 'videoUnderstanding',
				videoUnderstandingUrl: 'https://sns-video-v4.xhscdn.com/a.mp4?secret=signature',
			})[name] ?? fallback,
		getNode: () => ({ name: 'test', type: 'maibaoApi', parameters: {} }),
		continueOnFail: () => true,
		helpers: {
			httpRequest: async (options) => {
				if (options.method === 'GET') return rangeResponse(options, bytes);
				posts++;
				throw Object.assign(new Error('private-key https://secret.example/test'), {
					statusCode: 403,
				});
			},
		},
	};
	const [[item]] = await node.execute.call(context);
	assert.equal(posts, 1);
	assert.match(item.json.error, /HTTP 403/);
	assert.doesNotMatch(JSON.stringify(item), /private-key|secret|signature/);
	assert.deepEqual(item.pairedItem, { item: 0 });
});
