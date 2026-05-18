const test = require('node:test');
const assert = require('node:assert/strict');

const {
	buildGptImageMultipartFormData,
	buildGptImageRequest,
	isGptImageModel,
	resolveGptImageSize,
} = require('../dist/nodes/MaibaoApi/GptImageUtils.js');
const { MaibaoApi } = require('../dist/nodes/MaibaoApi/MaibaoApi.node.js');

test('识别 gpt-image-2 模型', () => {
	assert.equal(isGptImageModel('gpt-image-2'), true);
	assert.equal(isGptImageModel('gemini-3.1-flash-image-preview'), false);
});

test('无参考图时走文生图接口', () => {
	const request = buildGptImageRequest('gpt-image-2', {
		prompt: '一只海边散步的水獭',
		images: [],
		size: '2048x2048',
		quality: 'medium',
		background: 'auto',
		outputFormat: 'png',
	});

	assert.equal(request.endpoint, '/images/generations');
	assert.equal(request.usesMultipart, false);
	assert.deepEqual(request.body, {
		model: 'gpt-image-2',
		prompt: '一只海边散步的水獭',
		size: '2048x2048',
		quality: 'medium',
		background: 'auto',
		output_format: 'png',
		n: 1,
	});
	assert.equal(request.outputFileName, 'gpt_image_2.png');
	assert.equal(request.outputMimeType, 'image/png');
});

test('有参考图时走图像编辑接口', () => {
	const request = buildGptImageRequest('gpt-image-2', {
		prompt: '把这张图改成霓虹赛博朋克风格',
		images: [
			{
				base64: 'ZmFrZS1pbWFnZQ==',
				mimeType: 'image/png',
			},
		],
		size: '1536x1024',
		quality: 'high',
		background: 'opaque',
		outputFormat: 'webp',
	});

	assert.equal(request.endpoint, '/images/edits');
	assert.equal(request.usesMultipart, true);
	assert.deepEqual(request.body.images, [
		{
			base64: 'ZmFrZS1pbWFnZQ==',
			mimeType: 'image/png',
		},
	]);
	assert.equal(request.outputFileName, 'gpt_image_2.webp');
	assert.equal(request.outputMimeType, 'image/webp');
});

test('图像编辑 multipart 使用 OpenAI 兼容的 image[] 文件字段', () => {
	const request = buildGptImageRequest('gpt-image-2', {
		prompt: '把这张图改成霓虹赛博朋克风格',
		images: [
			{
				base64: Buffer.from('fake-image-1').toString('base64'),
				mimeType: 'image/png',
				fileName: 'source.png',
			},
			{
				base64: Buffer.from('fake-image-2').toString('base64'),
				mimeType: 'image/jpeg',
			},
		],
		size: '1536x1024',
		quality: 'high',
		background: 'opaque',
		outputFormat: 'webp',
	});

	const formData = buildGptImageMultipartFormData(request.body);

	assert.equal(formData.model, 'gpt-image-2');
	assert.equal(formData.prompt, '把这张图改成霓虹赛博朋克风格');
	assert.equal(formData.images, undefined);
	assert.equal(formData.image, undefined);
	assert.equal(Array.isArray(formData['image[]']), true);
	assert.equal(formData['image[]'].length, 2);
	assert.deepEqual(formData['image[]'][0], {
		value: Buffer.from('fake-image-1'),
		options: {
			filename: 'source.png',
			contentType: 'image/png',
		},
	});
	assert.deepEqual(formData['image[]'][1], {
		value: Buffer.from('fake-image-2'),
		options: {
			filename: 'reference-2.jpeg',
			contentType: 'image/jpeg',
		},
	});
});

test('透明背景不允许 jpeg 输出', () => {
	assert.throws(
		() =>
			buildGptImageRequest('gpt-image-2', {
				prompt: '透明背景图标',
				images: [],
				size: '1024x1024',
				quality: 'auto',
				background: 'transparent',
				outputFormat: 'jpeg',
			}),
		/透明背景仅支持 PNG 或 WEBP 输出格式/,
	);
});

test('透明背景使用 API 接受的 transparent_background 参数', () => {
	const request = buildGptImageRequest('gpt-image-2', {
		prompt: '透明背景图标',
		images: [],
		size: '1024x1024',
		quality: 'auto',
		background: 'transparent',
		outputFormat: 'png',
	});

	assert.equal(request.body.background, 'transparent_background');
});

test('节点默认使用 GPT-Image-2 且模型选项排在第一位', () => {
	const node = new MaibaoApi();
	const imageModelProperty = node.description.properties.find(
		(property) => property.name === 'imageModel',
	);

	assert.equal(imageModelProperty.default, 'gpt-image-2');
	assert.deepEqual(
		imageModelProperty.options.map((option) => ({ name: option.name, value: option.value })),
		[
			{ name: 'GPT-Image-2', value: 'gpt-image-2' },
			{ name: 'Nano Banana 2', value: 'gemini-3.1-flash-image-preview' },
			{ name: 'Nano Banana 1 Pro', value: 'gemini-3-pro-image-preview' },
			{ name: '即梦 5.0', value: 'doubao-seedream-5-0-260128' },
		],
	);
});

test('节点为 GPT-Image-2 提供官方支持的分辨率选项并将自定义放在最上方', () => {
	const node = new MaibaoApi();
	const imageSizeProperty = node.description.properties.find(
		(property) =>
			property.name === 'imageSize' &&
			property.displayOptions?.show?.imageModel?.includes('gpt-image-2'),
	);

	assert.deepEqual(
		imageSizeProperty.options.map((option) => ({ name: option.name, value: option.value })),
		[
			{ name: '自定义', value: 'custom' },
			{ name: '1024x1024（1:1）', value: '1024x1024' },
			{ name: '1024x1536（2:3）', value: '1024x1536' },
			{ name: '1536x1024（3:2）', value: '1536x1024' },
			{ name: '2048x1152（16:9）', value: '2048x1152' },
			{ name: '2048x2048（1:1）', value: '2048x2048' },
			{ name: '2160x3840（9:16）', value: '2160x3840' },
			{ name: '3840x2160（16:9）', value: '3840x2160' },
			{ name: '自动', value: 'auto' },
		],
	);
});

test('节点仅在 GPT-Image-2 选择自定义分辨率时显示输入框', () => {
	const node = new MaibaoApi();
	const customImageSizeProperty = node.description.properties.find(
		(property) => property.name === 'customImageSize',
	);

	assert.deepEqual(customImageSizeProperty.displayOptions, {
		show: { mode: ['image'], imageModel: ['gpt-image-2'], imageSize: ['custom'] },
	});
});

test('GPT-Image-2 自定义分辨率支持常见分隔符并统一为 OpenAI 格式', () => {
	assert.equal(resolveGptImageSize('custom', '2048x1152'), '2048x1152');
	assert.equal(resolveGptImageSize('custom', '2048*1152'), '2048x1152');
	assert.equal(resolveGptImageSize('custom', '2048×1152'), '2048x1152');
	assert.equal(resolveGptImageSize('custom', '2048 / 1152'), '2048x1152');
	assert.equal(resolveGptImageSize('auto'), 'auto');
	assert.equal(resolveGptImageSize('1536x1024'), '1536x1024');
});

test('GPT-Image-2 自定义分辨率会拒绝非法格式', () => {
	assert.throws(
		() => resolveGptImageSize('custom', ''),
		/自定义分辨率格式无效/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '2048'),
		/自定义分辨率格式无效/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '2048x1152x1024'),
		/自定义分辨率格式无效/,
	);
});

test('GPT-Image-2 自定义分辨率会按 OpenAI 尺寸约束校验', () => {
	assert.throws(
		() => resolveGptImageSize('custom', '1025x1024'),
		/都必须能被 16 整除/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '3856x1024'),
		/最大边不能超过 3840px/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '3200x1024'),
		/长短边比例不能超过 3:1/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '512x512'),
		/总像素数必须在 655360 到 8294400 之间/,
	);
	assert.throws(
		() => resolveGptImageSize('custom', '3840x3840'),
		/总像素数必须在 655360 到 8294400 之间/,
	);
});

test('节点隐藏 GPT-Image-2 背景参数且不再暴露透明选项', () => {
	const node = new MaibaoApi();
	const backgroundProperty = node.description.properties.find(
		(property) => property.name === 'imageBackground',
	);

	assert.deepEqual(backgroundProperty.displayOptions, { show: { mode: ['__hidden__'] } });
	assert.deepEqual(
		backgroundProperty.options.map((option) => ({ name: option.name, value: option.value })),
		[
			{ name: '自动', value: 'auto' },
			{ name: '不透明', value: 'opaque' },
		],
	);
});
