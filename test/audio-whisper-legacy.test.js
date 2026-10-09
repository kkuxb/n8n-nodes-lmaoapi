const test = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../dist/nodes/MaibaoApi/audio/AudioBackend');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node');
const { transcribeWhisper } = require('../dist/nodes/MaibaoApi/audio/WhisperTranscription');
const { audioProperties } = require('../dist/nodes/MaibaoApi/audio/AudioProperties');

test('legacy request, language and both response contracts remain intact', async () => {
	const audio = {
		buffer: Buffer.from('audio'),
		fileName: 'clip.mp4',
		mimeType: 'video/mp4',
		format: 'mp4',
		propName: 'data',
	};
	for (const language of ['', 'zh', 'en']) {
		for (const format of ['text', 'verbose_json']) {
			let request;
			const response =
				format === 'text'
					? 'hello'
					: { text: '你好', words: [{ word: '你好', start: 0, end: 1 }], duration: 1 };
			const output = await transcribeWhisper(
				{
					helpers: {
						request: async (options) => {
							request = options;
							return response;
						},
					},
				},
				audio,
				'https://example.test/v1',
				'test-key',
				language,
				format,
			);
			assert.equal(request.url, 'https://example.test/v1/audio/transcriptions');
			assert.equal(request.formData.model, 'whisper-1');
			assert.equal(request.formData.file.value, audio.buffer);
			assert.equal(request.formData.language, language || undefined);
			assert.equal(request.formData.response_format, format);
			assert.equal(
				request.formData['timestamp_granularities[]'],
				format === 'text' ? undefined : 'word',
			);
			assert.equal(output._metadata.model, 'whisper-1');
			assert.equal(output._metadata.format, format);
			assert.equal(output._metadata.audioFormat, 'mp4');
			if (format === 'text') assert.equal(output.text, 'hello');
			else {
				assert.equal(output['time-text'], '[0.0s - 1.0s] 你好');
				assert.deepEqual(output.sentences, [{ text: '你好', start: 0, end: 1 }]);
			}
		}
	}
});

test('maintainer switch restores legacy UI and node execution including specified Binary', async () => {
	assert.ok(audioProperties('omni').every((p) => p.type === 'hidden'));
	assert.ok(audioProperties('whisper').every((p) => p.type === 'options'));
	const saved = backend.ACTIVE_AUDIO_BACKEND;
	backend.ACTIVE_AUDIO_BACKEND = 'whisper';
	try {
		const node = new MaibaoApi();
		assert.equal(
			node.description.properties.find((p) => p.name === 'audioLanguage').type,
			'options',
		);
		const result = await node.execute.call({
			getInputData: () => [{ json: {} }],
			getCredentials: async () => ({ baseUrl: 'https://example.test/v1', apiKey: 'test' }),
			getNodeParameter: (name, i, fallback) =>
				({
					mode: 'audio',
					binarySourceMode: 'specified',
					sourceNodeNames: 'Download',
					audioResponseFormat: 'text',
				})[name] ?? fallback,
			getWorkflowDataProxy: () => ({
				$: () => ({
					all: () => [
						{
							json: {},
							binary: {
								data: {
									data: Buffer.from('test').toString('base64'),
									fileName: 'a.mp4',
									mimeType: 'video/mp4',
								},
							},
						},
					],
				}),
			}),
			helpers: { request: async () => 'legacy output' },
			continueOnFail: () => false,
		});
		assert.equal(result[0][0].json.text, 'legacy output');
		assert.deepEqual(result[0][0].pairedItem, { item: 0 });
	} finally {
		backend.ACTIVE_AUDIO_BACKEND = saved;
	}
});
