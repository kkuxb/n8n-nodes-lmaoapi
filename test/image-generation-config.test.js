const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGeminiGenerationConfig, MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

test('Nano Banana 2.1 forwards selected image size in Gemini generation config', () => {
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

const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9Uz/2Q==', 'base64');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');

async function executeGemini(parts, references = false) {
	const calls = [];
	const prepared = [];
	const parameters = { mode: 'image', imageModel: 'gemini-nano-banana-2.1-preview', userPrompt: 'test', imageSize: '2K', aspectRatio: '21:9' };
	const context = {
		getInputData: () => [{ json: {}, ...(references ? { binary: { data: { data: jpeg.toString('base64'), mimeType: 'image/jpeg', fileName: 'reference.jpeg' } } } : {}) }],
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: 'https://api.example.test/v1' }),
		getNodeParameter: (name, index, fallback) => parameters[name] ?? fallback,
		getNode: () => ({ name: 'MaibaoAPI', type: 'n8n-nodes-maibaoapi.maibaoApi', typeVersion: 1, position: [0, 0], parameters }),
		continueOnFail: () => false,
		helpers: {
			getBinaryDataBuffer: async () => jpeg,
			httpRequest: async options => { calls.push(options); return { candidates: [{ content: { parts } }] }; },
			prepareBinaryData: async (buffer, fileName, mimeType) => {
				prepared.push({ buffer, fileName, mimeType });
				return { data: buffer.toString('base64'), fileName, mimeType };
			},
		},
	};
	const [output] = await new MaibaoApi().execute.call(context);
	return { calls, prepared, output };
}

test('Nano Banana 2.1 exposes 21:9 and retains the three resolutions', () => {
	const properties = new MaibaoApi().description.properties;
	const find = name => properties.find(p => p.name === name && p.displayOptions?.show?.imageModel?.includes('gemini-nano-banana-2.1-preview'));
	assert.deepEqual(find('imageSize').options.map(o => o.value), ['1K', '2K', '4K']);
	assert.equal(find('aspectRatio').options.length, 14);
	assert.ok(find('aspectRatio').options.some(o => o.value === '21:9'));
});

test('Nano Banana 2.1 generation and reference editing use the new endpoint and preserve JPEG bytes', async () => {
	for (const references of [false, true]) {
		const field = references ? 'inline_data' : 'inlineData';
		const result = await executeGemini([
			{ thought: true, inlineData: { data: png.toString('base64'), mimeType: 'image/png' } },
			{ [field]: { data: jpeg.toString('base64'), mimeType: 'image/png' } },
		], references);
		assert.equal(result.calls.length, 1);
		const request = result.calls[0];
		assert.equal(request.url, 'https://api.example.test/v1beta/models/gemini-nano-banana-2.1-preview:generateContent');
		assert.equal(request.method, 'POST');
		assert.deepEqual(request.body.generationConfig, { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '21:9', imageSize: '2K' } });
		assert.equal(request.body.contents[0].parts.length, references ? 2 : 1);
		if (references) assert.deepEqual(request.body.contents[0].parts[1].inline_data, { data: jpeg.toString('base64'), mime_type: 'image/jpeg' });
		assert.deepEqual(result.prepared, [{ buffer: jpeg, fileName: 'nano_banana_2_1.jpeg', mimeType: 'image/jpeg' }]);
		assert.equal(result.output[0].binary.data.mimeType, 'image/jpeg');
		assert.deepEqual(result.output[0].pairedItem, { item: 0 });
	}
});

test('Nano Banana 2.1 retains PNG output and rejects non-image payloads', async () => {
	const result = await executeGemini([{ inlineData: { data: png.toString('base64') } }]);
	assert.equal(result.output[0].binary.data.fileName, 'nano_banana_2_1.png');
	assert.equal(result.output[0].binary.data.mimeType, 'image/png');
	await assert.rejects(executeGemini([{ inlineData: { data: Buffer.from('<html>error</html>').toString('base64') } }]), /不是有效的/);
});

test('Nano Banana 2.1 keeps forwarding square 2K generation config', () => {
	const generationConfig = buildGeminiGenerationConfig('1:1', '2K');

	assert.deepEqual(generationConfig, {
		responseModalities: ['IMAGE'],
		imageConfig: {
			aspectRatio: '1:1',
			imageSize: '2K',
		},
	});
});
