const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGeminiGenerationConfig } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

test('Nano Banana 2 forwards selected image size in Gemini generation config', () => {
	const generationConfig = buildGeminiGenerationConfig(
		'16:9',
		'4K',
	);

	assert.deepEqual(generationConfig, {
		responseModalities: ['IMAGE'],
		imageConfig: {
			aspectRatio: '16:9',
			imageSize: '4K',
		},
	});
});

test('Nano Banana 2 keeps forwarding square 2K generation config', () => {
	const generationConfig = buildGeminiGenerationConfig('1:1', '2K');

	assert.deepEqual(generationConfig, {
		responseModalities: ['IMAGE'],
		imageConfig: {
			aspectRatio: '1:1',
			imageSize: '2K',
		},
	});
});
