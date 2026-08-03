const test = require('node:test');
const assert = require('node:assert/strict');

const {
	MaibaoApi,
	convertWordsToSentences,
} = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

test('文字、图像和语音模式统一使用 data 到 data5 的 Binary 属性默认值', () => {
	const node = new MaibaoApi();
	const expectedDefault = 'data,data0,data1,data2,data3,data4,data5';
	const binaryProperty = node.description.properties.find(
		(property) => property.name === 'binaryPropertyName',
	);
	const audioProperty = node.description.properties.find(
		(property) => property.name === 'audioPropertyName',
	);

	assert.equal(binaryProperty.default, expectedDefault);
	assert.equal(audioProperty.default, expectedDefault);
});

test('句级时间戳同时输出可直接拖拽的 time-text 字段', () => {
	const result = convertWordsToSentences({
		task: 'transcribe',
		language: 'chinese',
		duration: 4.02,
		text: '第一句话 第二句话',
		words: [
			{ word: '第一', start: 0.02, end: 0.7 },
			{ word: '句话', start: 0.7, end: 1.34 },
			{ word: '第二', start: 1.48, end: 2.7 },
			{ word: '句话', start: 2.7, end: 4.02 },
		],
	});

	assert.equal(result['time-text'], '[0.0s - 1.3s] 第一句话\n[1.5s - 4.0s] 第二句话');
	assert.deepEqual(result.sentences, [
		{ text: '第一句话', start: 0, end: 1.3 },
		{ text: '第二句话', start: 1.5, end: 4 },
	]);
	assert.equal('words' in result, false);
	assert.ok(Object.keys(result).indexOf('time-text') < Object.keys(result).indexOf('sentences'));
});

test('API 未返回词级时间戳时保持原响应不变', () => {
	const response = { text: '只有转写文本', task: 'transcribe' };

	assert.strictEqual(convertWordsToSentences(response), response);
});
