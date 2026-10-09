const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTranscriptMarkdown } = require('../dist/nodes/MaibaoApi/audio/TranscriptMarkdown');
const { mergeTranscripts } = require('../dist/nodes/MaibaoApi/audio/TranscriptMerge');

test('Markdown uses global whole seconds, short intervals and hours', () => {
	assert.equal(
		renderTranscriptMarkdown([
			{ start: 0.1, end: 5.92, text: '第一句话。' },
			{ start: 3599.8, end: 3600.1, text: '下一句。' },
		]),
		'- **[00:00–00:06]** 第一句话。\n- **[59:59–01:00:01]** 下一句。',
	);
	assert.equal(
		renderTranscriptMarkdown([{ start: 0.1, end: 0.2, text: '短句' }]),
		'- **[00:00–00:01]** 短句',
	);
	assert.equal(renderTranscriptMarkdown([]), '');
	assert.equal(
		renderTranscriptMarkdown([{ start: 0, end: 1, text: '<b> *hi*\n[next]' }]),
		'- **[00:00–00:01]** &lt;b&gt; \\*hi\\* \\[next\\]',
	);
});

test('merge sorts completion order, keeps exact offsets and removes only overlapping identical speech', () => {
	const a = { index: 0, startSeconds: 0, ownedStartSeconds: 0, ownedEndSeconds: 29.95 };
	const b = { index: 1, startSeconds: 29.45, ownedStartSeconds: 29.95, ownedEndSeconds: 59.9 };
	const merged = mergeTranscripts([
		{
			chunk: b,
			segments: [
				{ start: 0, end: 0.6, text: 'hello world' },
				{ start: 1, end: 2, text: 'hello world' },
			],
		},
		{ chunk: a, segments: [{ start: 29.5, end: 29.9, text: 'hello world' }] },
	]);
	assert.equal(merged.length, 2);
	assert.equal(merged[1].start, 30.45);
	assert.equal(merged[1].text, 'hello world');
});

test('boundary stitching requires exact multiword overlap and keeps later repetitions and uncertain fragments', () => {
	const a = { index: 0, startSeconds: 0, ownedStartSeconds: 0, ownedEndSeconds: 30 };
	const b = { index: 1, startSeconds: 29.5, ownedStartSeconds: 30, ownedEndSeconds: 60 };
	for (const [left, right, expected] of [
		[
			'So riders can switch',
			'riders can switch between calls.',
			'So riders can switch between calls.',
		],
		['保持清晰语音通话', '清晰语音通话，接下来出发。', '保持清晰语音通话，接下来出发。'],
	]) {
		const result = mergeTranscripts([
			{ chunk: a, segments: [{ start: 27, end: 30, text: left }] },
			{
				chunk: b,
				segments: [
					{ start: 0, end: 4, text: right },
					{ start: 5, end: 8, text: right },
				],
			},
		]);
		assert.equal(result.length, 2);
		assert.equal(result[0].text, expected);
		assert.equal(result[0].start, 27);
		assert.equal(result[0].end, 33.5);
		assert.equal(result[1].text, right);
	}
	for (const [left, right] of [
		['provides pre-', 'premium features'],
		['say yes', 'yes again'],
		['clear audio', 'clearer audio'],
	]) {
		const result = mergeTranscripts([
			{ chunk: a, segments: [{ start: 27, end: 30, text: left }] },
			{ chunk: b, segments: [{ start: 0, end: 4, text: right }] },
		]);
		assert.equal(result.length, 2);
	}
});
