/* eslint-disable n8n-nodes-base/node-filename-against-convention */
import { ACTIVE_AUDIO_BACKEND } from './audio/AudioBackend';
import { audioProperties } from './audio/AudioProperties';
import { transcribeWhisper } from './audio/WhisperTranscription';
import { transcribeOmni } from './audio/OmniTranscription';
export { convertWordsToSentences } from './audio/WhisperTranscription';
import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	IBinaryData,
} from 'n8n-workflow';

import {
	buildGptImageRequest,
	buildGptImageMultipartFormData,
	GptImageMultipartFile,
	isGptImageModel,
	isGptImage25Model,
	GPT_IMAGE_MODELS,
	GPT_IMAGE_25_MODELS,
	GptImageBackground,
	GptImageOutputFormat,
	GptImageQuality,
	resolveGptImageSize,
} from './GptImageUtils';
import { detectImageFormat, resolveGptImageResponse } from './GptImageResponse';
import { downloadGptImage } from './GptImageDownload';
import { asObject, GptImageError, ImageDiagnostics, responseRequestId, responseStatus, safeToken } from './GptImageDiagnostics';

const REQUEST_TIMEOUT_MS = 600000;

function debugLog(_scope: string, _details: Record<string, unknown>): void {
	void _scope;
	void _details;
	// Disabled because n8n community nodes lint forbids direct process.env access.
}

export function pushExecutionData(
	returnData: INodeExecutionData[],
	itemIndex: number,
	output: INodeExecutionData,
): void {
	returnData.push({
		...output,
		pairedItem: { item: itemIndex },
	});
}

// 图片数据接口
interface ImageData {
	base64: string;
	mimeType: string;
	fileName?: string;
	buffer: Buffer;
}

// 音频数据接口
interface AudioData {
	buffer: Buffer;
	mimeType: string;
	fileName: string;
	propName: string;
	format: string;
}

// 收集结果接口，包含 binary 数据和预读取的 buffer 映射
interface CollectedBinaryResult {
	binary: Record<string, IBinaryData>;
	bufferMap: Map<string, Buffer>; // propName -> 预读取的 buffer
}

export function buildGeminiGenerationConfig(
	aspectRatio: string,
	imageSize: string,
): Record<string, unknown> {
	const imageConfig: Record<string, unknown> = { aspectRatio };

	imageConfig.imageSize = imageSize;

	return {
		responseModalities: ['IMAGE'],
		imageConfig,
	};
}

function buildNativeMultipartBody(
	context: IExecuteFunctions,
	formDataBody: Record<string, unknown>,
): FormData {
	if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
		throw new NodeOperationError(context.getNode(), '当前运行环境不支持 multipart FormData。');
	}

	const formData = new FormData();
	for (const [key, value] of Object.entries(formDataBody)) {
		if (value === undefined || value === null) {
			continue;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				const multipartFile = item as GptImageMultipartFile;
				if (
					typeof multipartFile === 'object' &&
					multipartFile !== null &&
					'value' in multipartFile &&
					'options' in multipartFile
				) {
					const fileValue = multipartFile.value as Buffer;
					const blobPart = fileValue.buffer.slice(
						fileValue.byteOffset,
						fileValue.byteOffset + fileValue.byteLength,
					) as ArrayBuffer;
					const blob = new Blob([blobPart], {
						type: multipartFile.options.contentType,
					});
					formData.append(key, blob, multipartFile.options.filename);
				} else {
					formData.append(key, String(item));
				}
			}
		} else {
			formData.append(key, String(value));
		}
	}

	return formData;
}

// 从指定节点收集 Binary 数据并合并（同时预读取文件系统中的 binary）
async function collectBinaryFromNodes(
	context: IExecuteFunctions,
	itemIndex: number,
	sourceMode: 'current' | 'specified',
	specifiedNodes: string[],
): Promise<CollectedBinaryResult> {
	const mergedBinary: Record<string, IBinaryData> = {};
	const bufferMap = new Map<string, Buffer>();

	if (sourceMode === 'current') {
		// 当前模式：直接返回当前输入的 binary（不需要预读取，getBinaryDataBuffer 可用）
		const items = context.getInputData();
		if (items[itemIndex]?.binary) {
			return { binary: { ...items[itemIndex].binary }, bufferMap };
		}
		return { binary: mergedBinary, bufferMap };
	}

	// 获取工作流数据代理
	const workflowProxy = context.getWorkflowDataProxy(itemIndex);

	// 指定模式：使用用户提供的节点名称
	const targetNodeNames = specifiedNodes;

	// 从目标节点收集 Binary
	let binaryIndex = 0;

	for (const nodeName of targetNodeNames) {
		try {
			// 使用 $(nodeName).all() 获取节点数据（与 n8n Code 节点一致）
			const nodeProxy = workflowProxy.$(nodeName);
			const nodeItems: INodeExecutionData[] = nodeProxy.all();

			if (!nodeItems || nodeItems.length === 0) continue;

			// 取对应 itemIndex 的数据，如果不存在则取第一个
			const targetItemIndex = itemIndex < nodeItems.length ? itemIndex : 0;
			const nodeItem = nodeItems[targetItemIndex];

			if (!nodeItem?.binary) continue;

			// 合并 Binary 数据
			for (const [, binaryData] of Object.entries(nodeItem.binary)) {
				// 生成新的属性名：data, data0, data1, data2...
				let newPropName: string;
				if (binaryIndex === 0) {
					newPropName = 'data';
				} else {
					newPropName = `data${binaryIndex - 1}`;
				}

				// 避免覆盖已存在的属性
				while (mergedBinary[newPropName]) {
					binaryIndex++;
					newPropName = `data${binaryIndex - 1}`;
				}

				mergedBinary[newPropName] = binaryData as IBinaryData;

				// 如果 binary 存储在文件系统中（有 id），立即预读取其内容
				if (binaryData.id) {
					try {
						const stream = await context.helpers.getBinaryStream(binaryData.id);
						const buffer = await context.helpers.binaryToBuffer(stream);
						bufferMap.set(newPropName, buffer);
					} catch {
						// 如果读取失败，尝试使用内联 data
						if (binaryData.data) {
							bufferMap.set(newPropName, Buffer.from(binaryData.data, 'base64'));
						}
					}
				} else if (binaryData.data) {
					// 内联 base64 数据，直接解码
					bufferMap.set(newPropName, Buffer.from(binaryData.data, 'base64'));
				}

				binaryIndex++;
			}
		} catch {
			// 静默忽略找不到的节点
			continue;
		}
	}

	// 如果没有收集到任何数据，回退到当前输入
	if (Object.keys(mergedBinary).length === 0) {
		const items = context.getInputData();
		if (items[itemIndex]?.binary) {
			return { binary: { ...items[itemIndex].binary }, bufferMap };
		}
	}

	return { binary: mergedBinary, bufferMap };
}

// 从 Binary 对象中提取图片
async function extractImagesFromBinary(
	context: IExecuteFunctions,
	itemIndex: number,
	binary: Record<string, IBinaryData>,
	propNames: string[],
	maxImages: number,
	bufferMap?: Map<string, Buffer>,
): Promise<ImageData[]> {
	const images: ImageData[] = [];

	for (const propName of propNames) {
		if (images.length >= maxImages) break;

		const binaryData = binary[propName];
		if (!binaryData) {
			debugLog('extractImagesFromBinary.skip', { itemIndex, propName, reason: 'missing_binary' });
			continue;
		}
		if (!binaryData.mimeType?.startsWith('image/')) {
			debugLog('extractImagesFromBinary.skip', {
				itemIndex,
				propName,
				reason: 'not_image',
				mimeType: binaryData.mimeType,
			});
			continue;
		}

		try {
			// 需要从 binary data 获取 buffer
			let buffer: Buffer;

			// 优先使用预读取的 buffer（跨节点收集时已读取）
			if (bufferMap?.has(propName)) {
				buffer = bufferMap.get(propName)!;
			} else if (binaryData.id) {
				// 存储在文件系统中的 binary（当前节点输入）
				buffer = await context.helpers.getBinaryDataBuffer(itemIndex, propName);
			} else if (binaryData.data) {
				// 内联 base64 数据
				buffer = Buffer.from(binaryData.data, 'base64');
			} else {
				continue;
			}

			images.push({
				base64: buffer.toString('base64'),
				mimeType: binaryData.mimeType,
				fileName: binaryData.fileName,
				buffer,
			});
			debugLog('extractImagesFromBinary.hit', {
				itemIndex,
				propName,
				mimeType: binaryData.mimeType,
				fileName: binaryData.fileName ?? null,
				byteLength: buffer.length,
				source: bufferMap?.has(propName) ? 'bufferMap' : binaryData.id ? 'binaryDataBuffer' : 'inline_base64',
			});
		} catch {
			// 无法读取该图片，跳过
			debugLog('extractImagesFromBinary.error', {
				itemIndex,
				propName,
				mimeType: binaryData.mimeType,
				hasId: Boolean(binaryData.id),
			});
		}
	}

	return images;
}

// 从 URL 下载图片
async function downloadImagesFromUrls(
	context: IExecuteFunctions,
	urls: string[],
	maxImages: number,
): Promise<ImageData[]> {
	const images: ImageData[] = [];

	for (const url of urls) {
		if (images.length >= maxImages) break;
		if (!url) continue;

		try {
			const response = await context.helpers.httpRequest({
				method: 'GET',
				url,
				encoding: 'arraybuffer',
				returnFullResponse: true,
				timeout: REQUEST_TIMEOUT_MS,
			});

			const buffer = Buffer.from(response.body as ArrayBuffer);
			const contentType = (response.headers['content-type'] || 'image/jpeg') as string;
			const mimeType = contentType.split(';')[0].trim();

			// 仅处理图片类型
			if (!mimeType.startsWith('image/')) continue;

			images.push({
				base64: buffer.toString('base64'),
				mimeType,
				fileName: url.split('/').pop()?.split('?')[0] || 'image.jpg',
				buffer,
			});
		} catch {
			// 下载失败，跳过
			continue;
		}
	}

	return images;
}

// 从 Binary 对象中提取音频文件
async function extractAudioFromBinary(
	context: IExecuteFunctions,
	itemIndex: number,
	binary: Record<string, IBinaryData>,
	propNames: string[],
	bufferMap?: Map<string, Buffer>,
): Promise<AudioData | null> {
	const supportedFormats = ['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'];

	for (const propName of propNames) {
		const binaryData = binary[propName];
		if (!binaryData) continue;

		// 检查是否为音频或视频文件
		const isAudioOrVideo =
			binaryData.mimeType?.startsWith('audio/') || binaryData.mimeType?.startsWith('video/');
		if (!isAudioOrVideo) continue;

		// 获取文件扩展名
		const fileExt = binaryData.fileName?.split('.').pop()?.toLowerCase() || '';
		if (!fileExt) continue;

		// 验证格式
		if (!supportedFormats.includes(fileExt)) {
			throw new NodeOperationError(
				context.getNode(),
				`不支持的音频格式：${fileExt}。仅支持 ${supportedFormats.join(', ')}`,
			);
		}

		try {
			// 获取 buffer
			let buffer: Buffer;

			// 优先使用预读取的 buffer（跨节点收集时已读取）
			if (bufferMap?.has(propName)) {
				buffer = bufferMap.get(propName)!;
			} else if (binaryData.id) {
				// 存储在文件系统中的 binary（当前节点输入）
				buffer = await context.helpers.getBinaryDataBuffer(itemIndex, propName);
			} else if (binaryData.data) {
				// 内联 base64 数据
				buffer = Buffer.from(binaryData.data, 'base64');
			} else {
				continue;
			}

			return {
				buffer,
				mimeType: binaryData.mimeType,
				fileName: binaryData.fileName || `audio.${fileExt}`,
				propName,
				format: fileExt,
			};
		} catch {
			// 无法读取该音频，跳过
			continue;
		}
	}

	return null;
}

export class MaibaoApi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LmaoAPI',
		name: 'lmaoApi',
		icon: 'file:maibaoapi.svg',
		group: ['transform'],
		version: 1,
		description: '调用 LmaoAPI 进行文字生成、图像生成及音频转文本',
		defaults: { name: 'LmaoAPI' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'lmaoApi', required: true }],
		properties: [
			{
				displayName: '模式',
				name: 'mode',
				type: 'options',
				options: [
					// { name: '视频生成 (Sora 2)', value: 'video' },
					{ name: '图像生成', value: 'image' },
					{ name: '文字生成', value: 'text' },
					// { name: '向量嵌入 (Embeddings)', value: 'embeddings' },
					{ name: '音频转文本', value: 'audio' },
				],
				default: 'text',
			},
			{
				displayName: '操作',
				name: 'videoOperation',
				type: 'options',
				displayOptions: { show: { mode: ['video'] } },
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items -- Keep workflow order regardless of the runner's Chinese/English locale.
				options: [
					{ name: '创建视频', value: 'create' },
					{ name: '混编/修改视频', value: 'remix' },
					{ name: '检索视频', value: 'retrieve' },
					{ name: '下载视频', value: 'download' },
					{ name: '列出视频', value: 'list' },
				],
				default: 'create',
			},
			// --- 模型选择 ---
			{
				displayName: '生成模型',
				name: 'imageModel',
				type: 'options',
				displayOptions: { show: { mode: ['image'] } },
				options: [
					{ name: 'GPT-Image-2.5 Sunburst', value: 'gpt-image-2.5-sunburst' },
					{ name: 'GPT-Image-2.5 Flare', value: 'gpt-image-2.5-flare' },
					{ name: 'GPT-Image-2', value: 'gpt-image-2' },
					{ name: 'Nano Banana 2.1', value: 'gemini-nano-banana-2.1-preview' },
				],
				default: 'gpt-image-2',
			},
			{
				displayName: '生成模型',
				name: 'videoModel',
				type: 'options',
				displayOptions: { show: { mode: ['video'], videoOperation: ['create'] } },
				options: [
					{ name: 'Sora 2', value: 'sora-2-all' },
					{ name: 'Sora 2 Pro', value: 'sora-2-pro-all' },
				],
				default: 'sora-2-all',
			},
			{
				displayName: '模型 ID',
				name: 'modelId',
				type: 'string',
				displayOptions: { show: { mode: ['text'] } },
				default: 'claude-sonnet-5-5',
				required: true,
			},
			{
				displayName: '系统提示词 (System Prompt)',
				name: 'systemPrompt',
				type: 'string',
				displayOptions: { show: { mode: ['text'] } },
				default: '你是一个专业的助手。',
			},
			{
				displayName: '用户提示词',
				name: 'userPrompt',
				type: 'string',
				displayOptions: { show: { mode: ['text', 'image'] } },
				default: '',
				required: true,
			},
			// --- 视频参数：故事板逻辑 ---
			{
				displayName: '故事板模式',
				name: 'storyboardMode',
				type: 'boolean',
				displayOptions: { show: { mode: ['video'], videoOperation: ['create'] } },
				default: false,
				description: 'Whether to enable storyboard mode for multi-shot prompts',
			},
			{
				displayName: '分镜列表',
				name: 'storyboardShots',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				displayOptions: { show: { mode: ['video'], videoOperation: ['create'], storyboardMode: [true] } },
				placeholder: '添加分镜',
				default: {
					shots: [
						{ shotPrompt: '描述第一个镜头内容', duration: 5 },
						{ shotPrompt: '描述第二个镜头内容', duration: 5 },
					],
				},
				options: [
					{
						name: 'shots',
						displayName: 'Shots',
						values: [
							{
								displayName: '分镜描述',
								name: 'shotPrompt',
								type: 'string',
								default: '',
								required: true,
							},
							{
								displayName: '镜头时长 (秒)',
								name: 'duration',
								type: 'number',
								default: 5,
							},
						],
					},
				],
			},
			{
				displayName: '视频提示词',
				name: 'videoPrompt',
				type: 'string',
				displayOptions: { 
					show: { mode: ['video'], videoOperation: ['create', 'remix'] },
					hide: { storyboardMode: [true] }
				},
				default: '',
				required: true,
			},
			{
				displayName: '目标分辨率',
				name: 'videoSize',
				type: 'options',
				displayOptions: { show: { mode: ['video'], videoOperation: ['create'] } },
				options: [
					{ name: '720x1280 (9:16)', value: '720x1280' },
					{ name: '1280x720 (16:9)', value: '1280x720' },
					{ name: '1024x1792 (9:16)', value: '1024x1792' },
					{ name: '1792x1024 (16:9)', value: '1792x1024' },
				],
				default: '720x1280',
			},
			{
				displayName: '视频 ID',
				name: 'videoId',
				type: 'string',
				displayOptions: { show: { mode: ['video'], videoOperation: ['remix', 'retrieve', 'download'] } },
				default: '',
				required: true,
			},
			{
				displayName: '智能轮询等待',
				name: 'smartWait',
				type: 'boolean',
				displayOptions: { show: { mode: ['video'], videoOperation: ['retrieve'] } },
				default: true,
				description: 'Whether to poll every 15s until completed or failed (max 10 minutes)',
			},
			// --- 分辨率：图像生成 ---
			{
				displayName: '分辨率',
				name: 'imageSize',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: ['gemini-nano-banana-2.1-preview'] } },
				options: [{ name: '1K', value: '1K' }, { name: '2K', value: '2K' }, { name: '4K', value: '4K' }],
				default: '1K',
			},
			{
				displayName: '分辨率',
				name: 'imageSize',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: GPT_IMAGE_MODELS } },
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
				options: [
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
				default: 'auto',
			},
			{
				displayName: '自定义分辨率',
				name: 'customImageSize',
				type: 'string',
				displayOptions: {
					show: { mode: ['image'], imageModel: GPT_IMAGE_MODELS, imageSize: ['custom'] },
				},
				default: '',
				placeholder: '2048x1152',
				description: '支持 2048x1152、2048*1152、2048×1152 等格式，提交前会按 OpenAI 规则校验。',
			},
			{
				displayName: '生成质量',
				name: 'imageQuality',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: ['gpt-image-2'] } },
				options: [
					{ name: '自动', value: 'auto' },
					{ name: '低', value: 'low' },
					{ name: '中', value: 'medium' },
					{ name: '高', value: 'high' },
				],
				default: 'auto',
			},
			{
				displayName: '背景',
				name: 'imageBackground',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: GPT_IMAGE_25_MODELS } },
				options: [
					{ name: '自动', value: 'auto' },
					{ name: '不透明', value: 'opaque' },
					{ name: '透明', value: 'transparent' },
				],
				default: 'auto',
				description: '透明背景仅支持 PNG 或 WEBP 输出格式',
			},
			{
				displayName: '生成质量',
				name: 'imageQuality',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: GPT_IMAGE_25_MODELS } },
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items -- Keep quality levels in increasing order after auto.
				options: [
					{ name: '自动', value: 'auto' },
					{ name: '低', value: 'low' },
					{ name: '中', value: 'medium' },
					{ name: '高', value: 'high' },
					{ name: '超高', value: 'xhigh' },
					{ name: '最高', value: 'max' },
				],
				default: 'auto',
			},
			{
				displayName: '输出格式',
				name: 'imageOutputFormat',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: GPT_IMAGE_MODELS } },
				options: [
					{ name: 'PNG', value: 'png' },
					{ name: 'JPEG', value: 'jpeg' },
					{ name: 'WEBP', value: 'webp' },
				],
				default: 'png',
			},
			{
				displayName: '尺寸比例',
				name: 'aspectRatio',
				type: 'options',
				displayOptions: { show: { mode: ['image'], imageModel: ['gemini-nano-banana-2.1-preview'] } },
				options: [
					{ name: '1:1', value: '1:1' }, { name: '1:4', value: '1:4' },
					{ name: '1:8', value: '1:8' }, { name: '16:9', value: '16:9' },
					{ name: '2:3', value: '2:3' }, { name: '21:9', value: '21:9' },
					{ name: '3:2', value: '3:2' },
					{ name: '3:4', value: '3:4' }, { name: '4:1', value: '4:1' },
					{ name: '4:3', value: '4:3' }, { name: '4:5', value: '4:5' },
					{ name: '5:4', value: '5:4' }, { name: '8:1', value: '8:1' },
					{ name: '9:16', value: '9:16' },
				],
				default: '1:1',
			},
			// --- Embeddings 参数 ---
			{
				displayName: '嵌入模型',
				name: 'embeddingModel',
				type: 'options',
				displayOptions: { show: { mode: ['embeddings'] } },
				options: [
					{ name: 'text-embedding-3-large', value: 'text-embedding-3-large' },
					{ name: 'text-embedding-3-small', value: 'text-embedding-3-small' },
				],
				default: 'text-embedding-3-large',
			},
			{
				displayName: '输入文本',
				name: 'embeddingInput',
				type: 'string',
				displayOptions: { show: { mode: ['embeddings'] } },
				default: '',
				required: true,
				description: '需要生成向量嵌入的文本内容',
			},
			// --- 图片/音频属性设置 ---
			{
				displayName: 'Binary 来源模式',
				name: 'binarySourceMode',
				type: 'options',
				options: [
					{ name: '当前节点输入', value: 'current' },
					{ name: '指定节点', value: 'specified' },
					{ name: '从 URL 获取', value: 'url' },
				],
				default: 'current',
				displayOptions: {
					show: {
						mode: ['text', 'image', 'video']
					},
					hide: {
						videoOperation: ['remix', 'retrieve', 'download', 'list']
					}
				},
				description: '选择从哪些节点读取 Binary 数据，或从 URL 获取图片',
			},
			{
				displayName: 'Binary 来源模式',
				name: 'binarySourceMode',
				type: 'options',
				options: [
					{ name: '当前节点输入', value: 'current' },
					{ name: '指定节点', value: 'specified' },
				],
				default: 'current',
				displayOptions: {
					show: {
						mode: ['audio']
					}
				},
				description: '选择从哪些节点读取 Binary 数据',
			},
			{
				displayName: '指定节点名称',
				name: 'sourceNodeNames',
				type: 'string',
				default: '',
				placeholder: 'HTTP Request, Read File, Code',
				displayOptions: {
					show: {
						binarySourceMode: ['specified']
					}
				},
				description: '用逗号分隔多个节点名称（精确匹配）',
			},
			{
				displayName: '图片 URL',
				name: 'imageUrls',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/image1.jpg, https://example.com/image2.jpg',
				displayOptions: {
					show: {
						binarySourceMode: ['url'],
						mode: ['text', 'image', 'video']
					},
					hide: {
						videoOperation: ['remix', 'retrieve', 'download', 'list']
					}
				},
				description: '输入图片 URL，多个 URL 用逗号分隔（最多10张）',
			},
			{
				displayName: '图片属性名',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data,data0,data1,data2,data3,data4,data5',
				displayOptions: {
					show: {
						mode: ['text', 'image', 'video']
					},
					hide: {
						videoOperation: ['remix', 'retrieve', 'download', 'list'],
						binarySourceMode: ['url']
					}
				},
				description: '用于文字识别、图像参考、及视频创建的参考图',
			},
			// --- 音频转文本参数 ---
			{
				displayName: '音频属性名',
				name: 'audioPropertyName',
				type: 'string',
				default: 'data,data0,data1,data2,data3,data4,data5',
				displayOptions: {
					show: {
						mode: ['audio']
					}
				},
				description: '从 Binary 中读取音频文件的属性名（逗号分隔，自动检测第一个匹配项）',
			},
			...audioProperties(ACTIVE_AUDIO_BACKEND),
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('lmaoApi');
		const mode = this.getNodeParameter('mode', 0) as string;
		const configuredBaseUrl = (credentials.lmaoBaseUrl as string | undefined)?.trim();
		const legacyBaseUrl = (credentials.baseUrl as string | undefined)?.trim();
		const legacyCustomBaseUrl =
			legacyBaseUrl && !/^https:\/\/(?:api|ai)\.maibao\.chat(?:\/v1)?\/?$/i.test(legacyBaseUrl)
				? legacyBaseUrl
				: undefined;
		const baseUrl = (configuredBaseUrl || legacyCustomBaseUrl || 'https://ai.lmao.net.cn').replace(/\/+$/, '');
		const rawBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
		const soraBaseUrl = rawBaseUrl.replace(/\/v1$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				const binaryPropInput = this.getNodeParameter('binaryPropertyName', i, 'data,data0,data1,data2,data3,data4,data5') as string;
				const propNames = binaryPropInput.split(',').map(s => s.trim()).filter(s => s !== '');

				if (mode === 'text') {
					const userPrompt = this.getNodeParameter('userPrompt', i) as string;
					const model = this.getNodeParameter('modelId', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i) as string;
					let combinedPrompt = userPrompt;
					const extractedText = items[i].json.text as string | undefined;

					if (extractedText && extractedText.trim() !== '') {
						combinedPrompt = combinedPrompt ? `${combinedPrompt}\n\n[参考文档内容]:\n${extractedText}` : extractedText;
					}

					// 获取 Binary 来源模式参数
					const binarySourceMode = this.getNodeParameter('binarySourceMode', i, 'current') as 'current' | 'specified' | 'url';
					const sourceNodeNamesInput = this.getNodeParameter('sourceNodeNames', i, '') as string;
					const specifiedNodes = sourceNodeNamesInput.split(',').map(s => s.trim()).filter(s => s !== '');

					// 提取图片（最多10张）
					let extractedImages: ImageData[];
					if (binarySourceMode === 'url') {
						const imageUrlsInput = this.getNodeParameter('imageUrls', i, '') as string;
						const urls = imageUrlsInput.split(',').map(s => s.trim()).filter(s => s !== '');
						extractedImages = await downloadImagesFromUrls(this, urls, 10);
					} else {
						// 收集 Binary 数据
						const { binary: collectedBinary, bufferMap } = await collectBinaryFromNodes(this, i, binarySourceMode, specifiedNodes);
						extractedImages = await extractImagesFromBinary(this, i, collectedBinary, propNames, 10, bufferMap);
					}

					// 构建用户消息内容（支持多图）
					let userContent: string | Array<Record<string, unknown>>;
					if (extractedImages.length > 0) {
						userContent = [{ type: 'text', text: combinedPrompt }];
						for (const img of extractedImages) {
							userContent.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
						}
					} else {
						userContent = combinedPrompt;
					}

					const responseData = await this.helpers.httpRequest({
						method: 'POST',
						url: `${rawBaseUrl}/chat/completions`,
						headers: { Authorization: `Bearer ${credentials.apiKey}` },
						body: {
							model,
							messages: [
								{ role: 'system', content: systemPrompt },
								{ role: 'user', content: userContent }
							]
						},
						json: true,
						timeout: REQUEST_TIMEOUT_MS,
					});
					pushExecutionData(returnData, i, { json: responseData });

				} else if (mode === 'image') {
					const userPrompt = this.getNodeParameter('userPrompt', i) as string;
					const imageModel = this.getNodeParameter('imageModel', i) as string;

					// 获取 Binary 来源模式参数
					const binarySourceMode = this.getNodeParameter('binarySourceMode', i, 'current') as 'current' | 'specified' | 'url';
					const sourceNodeNamesInput = this.getNodeParameter('sourceNodeNames', i, '') as string;
					const specifiedNodes = sourceNodeNamesInput.split(',').map(s => s.trim()).filter(s => s !== '');

					if (imageModel === 'gemini-nano-banana-2.1-preview') {
						const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];

						// 提取图片（最多10张）
						let extractedImages: ImageData[];
						if (binarySourceMode === 'url') {
							const imageUrlsInput = this.getNodeParameter('imageUrls', i, '') as string;
							const urls = imageUrlsInput.split(',').map(s => s.trim()).filter(s => s !== '');
							extractedImages = await downloadImagesFromUrls(this, urls, 10);
						} else {
							const { binary: collectedBinary, bufferMap } = await collectBinaryFromNodes(this, i, binarySourceMode, specifiedNodes);
							extractedImages = await extractImagesFromBinary(this, i, collectedBinary, propNames, 10, bufferMap);
						}
						for (const img of extractedImages) {
							parts.push({ inline_data: { data: img.base64, mime_type: img.mimeType } });
						}

						// 根据模型动态构建 generationConfig
						const aspectRatio = this.getNodeParameter('aspectRatio', i) as string;
						const rawSize = this.getNodeParameter('imageSize', i) as string;
						const generationConfig = buildGeminiGenerationConfig(aspectRatio, rawSize);

						debugLog('image.gemini.request', {
							itemIndex: i,
							model: imageModel,
							url: `${rawBaseUrl.replace(/\/v1$/, '')}/v1beta/models/${imageModel}:generateContent`,
							binarySourceMode,
							referenceImageCount: extractedImages.length,
							firstImageBytes: extractedImages[0]?.buffer.length ?? null,
							promptLength: userPrompt.length,
							imageSize: rawSize,
							aspectRatio,
							sentGenerationConfig: generationConfig,
						});

						const res = await this.helpers.httpRequest({
							method: 'POST',
							url: `${rawBaseUrl.replace(/\/v1$/, '')}/v1beta/models/${imageModel}:generateContent`,
							headers: { Authorization: `Bearer ${credentials.apiKey}` },
							body: { contents: [{ role: 'user', parts }], generationConfig },
							json: true,
							timeout: REQUEST_TIMEOUT_MS,
						});
						const imagePart = res.candidates?.[0]?.content?.parts?.find(
							(p: Record<string, unknown>) => !p.thought && (p.inlineData || p.inline_data),
						);
						const b64 = (imagePart?.inlineData ?? imagePart?.inline_data)?.data;
						if (typeof b64 === 'string' && b64.trim()) {
							const buffer = Buffer.from(b64, 'base64');
							const format = detectImageFormat(buffer);
							const binaryOutput = await this.helpers.prepareBinaryData(buffer, `nano_banana_2_1.${format.extension}`, format.mimeType);
							pushExecutionData(returnData, i, {
								json: { status: 'success' },
								binary: { data: binaryOutput },
							});
						} else throw new NodeOperationError(this.getNode(), 'Gemini 接口未返回图像。');

					} else if (isGptImageModel(imageModel)) {
						const rawSize = this.getNodeParameter('imageSize', i) as string;
						const customImageSize = this.getNodeParameter('customImageSize', i, '') as string;
						const resolvedSize = resolveGptImageSize(rawSize, customImageSize);
						const imageQuality = this.getNodeParameter('imageQuality', i, 'auto') as GptImageQuality;
						const imageBackground: GptImageBackground = isGptImage25Model(imageModel)
							? this.getNodeParameter('imageBackground', i, 'auto') as GptImageBackground
							: 'auto';
						const imageOutputFormat = this.getNodeParameter('imageOutputFormat', i, 'png') as GptImageOutputFormat;

						let extractedImages: ImageData[];
						if (binarySourceMode === 'url') {
							const imageUrlsInput = this.getNodeParameter('imageUrls', i, '') as string;
							const urls = imageUrlsInput.split(',').map(s => s.trim()).filter(s => s !== '');
							extractedImages = await downloadImagesFromUrls(this, urls, 10);
						} else {
							const { binary: collectedBinary, bufferMap } = await collectBinaryFromNodes(this, i, binarySourceMode, specifiedNodes);
							extractedImages = await extractImagesFromBinary(this, i, collectedBinary, propNames, 10, bufferMap);
						}

						const requestConfig = buildGptImageRequest(imageModel, {
							prompt: userPrompt,
							images: extractedImages.map((img) => ({
								base64: img.base64,
								mimeType: img.mimeType,
								fileName: img.fileName,
							})),
							size: resolvedSize,
							quality: imageQuality,
							background: imageBackground,
							outputFormat: imageOutputFormat,
						});
						debugLog('image.gpt.request', {
							itemIndex: i,
							model: imageModel,
							url: `${rawBaseUrl}${requestConfig.endpoint}`,
							binarySourceMode,
							usesMultipart: requestConfig.usesMultipart,
							referenceImageCount: extractedImages.length,
							firstImageBytes: extractedImages[0]?.buffer.length ?? null,
							promptLength: userPrompt.length,
							imageSize: resolvedSize,
							imageQuality,
							imageBackground,
							imageOutputFormat,
							multipartKeys: requestConfig.usesMultipart
								? Object.keys(buildGptImageMultipartFormData(requestConfig.body))
								: [],
						});
						let diagnostics: ImageDiagnostics = { stage: 'generation_request' };
						try {
							const response = await this.helpers.httpRequest({
								method: 'POST',
								url: `${rawBaseUrl}${requestConfig.endpoint}`,
								headers: { Authorization: `Bearer ${credentials.apiKey}` },
								body: requestConfig.usesMultipart
									? buildNativeMultipartBody(this, buildGptImageMultipartFormData(requestConfig.body)) as never
									: requestConfig.body,
								json: !requestConfig.usesMultipart,
								returnFullResponse: true,
								timeout: REQUEST_TIMEOUT_MS,
							});
							diagnostics = {
								stage: 'response_parse',
								generationStatusCode: responseStatus(response),
								generationRequestId: responseRequestId(response.headers),
							};
							const result = await resolveGptImageResponse(response.body, (url) => downloadGptImage(
								url,
								async (downloadUrl, timeout, abortSignal) => this.helpers.httpRequest({
									method: 'GET', url: downloadUrl, encoding: 'arraybuffer',
									returnFullResponse: true, timeout, abortSignal,
								}),
								{ signal: this.getExecutionCancelSignal?.() },
							));
							diagnostics = { ...diagnostics, ...result.diagnostics, stage: 'binary_output' };
							const binaryOutput = await this.helpers.prepareBinaryData(
								result.buffer,
								requestConfig.outputFileName.replace(/\.[^.]+$/, `.${result.extension}`),
								result.mimeType,
							);
							pushExecutionData(returnData, i, {
								json: {
									status: 'success', model: imageModel, endpoint: requestConfig.endpoint,
									hasReferenceImages: extractedImages.length > 0,
									...(result.imageUrl ? { imageUrl: result.imageUrl } : {}),
								},
								binary: { data: binaryOutput },
							});
						} catch (error) {
							let message: string;
							if (error instanceof GptImageError) {
								diagnostics = { ...diagnostics, ...error.diagnostics };
								message = error.message;
							} else if (diagnostics.stage === 'generation_request') {
								const object = asObject(error);
								diagnostics.generationStatusCode = responseStatus(object.response) ?? responseStatus(object);
								diagnostics.generationRequestId = responseRequestId(asObject(object.response).headers);
								diagnostics.errorCode = safeToken(object.code);
								message = '生图请求失败，未进入结果图片下载阶段。';
							} else {
								message = diagnostics.stage === 'binary_output'
									? '图片已解析，但写入 n8n Binary 失败。' : '生图响应处理失败。';
							}
							const status = diagnostics.generationStatusCode ? `；生图 HTTP ${diagnostics.generationStatusCode}` : '';
							const requestId = diagnostics.generationRequestId ? `；请求 ID：${diagnostics.generationRequestId}` : '';
							const operationError = new NodeOperationError(this.getNode(), `${imageModel}：${message}${status}${requestId}`, {
								itemIndex: i,
								description: '诊断及恢复下载信息（imageUrl 为临时访问链接，仅在执行详情中保留）：\n' + JSON.stringify(diagnostics, null, 2),
							});
							operationError.context.imageDownload = diagnostics;
							throw operationError;
						}

					} else {
						throw new NodeOperationError(this.getNode(), `图像模型 ${imageModel} 已移除或不受支持，请重新选择生成模型。`);
					}

				} else if (mode === 'video') {
					const operation = this.getNodeParameter('videoOperation', i) as string;

					if (operation === 'create') {
						const storyboardMode = this.getNodeParameter('storyboardMode', i) as boolean;
						const model = this.getNodeParameter('videoModel', i) as string;
						const size = this.getNodeParameter('videoSize', i) as string;
						let finalPrompt = '';

						if (storyboardMode) {
							const shotCollection = this.getNodeParameter('storyboardShots', i) as { shots?: Array<{ shotPrompt: string; duration: number }> };
							if (shotCollection?.shots) {
								finalPrompt = shotCollection.shots.map((s, index) => {
									return `Shot ${index + 1}:\nduration: ${s.duration}sec\nScene: ${s.shotPrompt}`;
								}).join('\n\n');
							}
						} else {
							finalPrompt = this.getNodeParameter('videoPrompt', i, '') as string;
						}

						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const formData: Record<string, any> = { prompt: finalPrompt, model, size };

						// 获取 Binary 来源模式参数
						const binarySourceMode = this.getNodeParameter('binarySourceMode', i, 'current') as 'current' | 'specified' | 'url';
						const sourceNodeNamesInput = this.getNodeParameter('sourceNodeNames', i, '') as string;
						const specifiedNodes = sourceNodeNamesInput.split(',').map(s => s.trim()).filter(s => s !== '');

						// 提取参考图（只取第一张）
						let extractedImages: ImageData[];
						if (binarySourceMode === 'url') {
							const imageUrlsInput = this.getNodeParameter('imageUrls', i, '') as string;
							const urls = imageUrlsInput.split(',').map(s => s.trim()).filter(s => s !== '');
							extractedImages = await downloadImagesFromUrls(this, urls, 1);
						} else {
							const { binary: collectedBinary, bufferMap } = await collectBinaryFromNodes(this, i, binarySourceMode, specifiedNodes);
							extractedImages = await extractImagesFromBinary(this, i, collectedBinary, propNames, 1, bufferMap);
						}
						if (extractedImages.length > 0) {
							const img = extractedImages[0];
							formData.input_reference = {
								value: img.buffer,
								options: { filename: img.fileName || 'reference.jpg', contentType: img.mimeType },
							};
						}

						// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
						const res = await this.helpers.request({
							method: 'POST',
							url: `${soraBaseUrl}/v1/videos`,
							headers: { Authorization: `${credentials.apiKey}` },
							formData,
							json: true,
							timeout: REQUEST_TIMEOUT_MS,
						});
						pushExecutionData(returnData, i, { json: res });

					} else if (operation === 'remix') {
						const video_id = this.getNodeParameter('videoId', i) as string;
						const prompt = this.getNodeParameter('videoPrompt', i, '') as string;
						const res = await this.helpers.httpRequest({
							method: 'POST',
							url: `${soraBaseUrl}/v1/videos/${video_id}/remix`,
							headers: { Authorization: `${credentials.apiKey}` },
							body: { prompt },
							json: true,
							timeout: REQUEST_TIMEOUT_MS,
						});
						pushExecutionData(returnData, i, { json: res });

					} else if (operation === 'retrieve') {
						const video_id = this.getNodeParameter('videoId', i) as string;
						const smartWait = this.getNodeParameter('smartWait', i) as boolean;
						
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						let res: any;
						if (smartWait) {
							for (let attempt = 0; attempt < 40; attempt++) {
								res = await this.helpers.httpRequest({
									method: 'GET',
									url: `${soraBaseUrl}/v1/videos/${video_id}`,
									headers: { Authorization: `${credentials.apiKey}` },
									timeout: REQUEST_TIMEOUT_MS,
								});
								if (['completed', 'failed'].includes(res.status)) break;
								// eslint-disable-next-line @n8n/community-nodes/no-restricted-globals
							await new Promise(resolve => globalThis.setTimeout(resolve, 15000));
							}
						} else {
							res = await this.helpers.httpRequest({
								method: 'GET',
								url: `${soraBaseUrl}/v1/videos/${video_id}`,
								headers: { Authorization: `${credentials.apiKey}` },
								timeout: REQUEST_TIMEOUT_MS,
							});
						}
						pushExecutionData(returnData, i, { json: res });

					} else if (operation === 'download') {
						const video_id = this.getNodeParameter('videoId', i) as string;
						const response = await this.helpers.httpRequest({
							method: 'GET',
							url: `${soraBaseUrl}/v1/videos/${video_id}/content`,
							headers: { Authorization: `${credentials.apiKey}` },
							qs: { variant: 'video' },
							encoding: 'arraybuffer',
							returnFullResponse: true,
							timeout: REQUEST_TIMEOUT_MS,
						});
						const binaryOutput = await this.helpers.prepareBinaryData(
							Buffer.from(response.body as ArrayBuffer), 
							'sora_video.mp4',
							'video/mp4'
						);
						pushExecutionData(returnData, i, {
							json: { status: 'success' },
							binary: { data: binaryOutput },
						});

					} else if (operation === 'list') {
						const res = await this.helpers.httpRequest({
							method: 'GET',
							url: `${soraBaseUrl}/v1/videos`,
							headers: { Authorization: `${credentials.apiKey}` },
							timeout: REQUEST_TIMEOUT_MS,
						});
						pushExecutionData(returnData, i, { json: res });
					}
				}

				else if (mode === 'audio') {
					// 获取参数
					const binarySourceMode = this.getNodeParameter('binarySourceMode', i, 'current') as 'current' | 'specified';
					const sourceNodeNamesInput = this.getNodeParameter('sourceNodeNames', i, '') as string;
					const specifiedNodes = sourceNodeNamesInput.split(',').map(s => s.trim()).filter(s => s !== '');
					const audioPropInput = this.getNodeParameter('audioPropertyName', i, 'data,data0,data1,data2,data3,data4,data5') as string;
					const propNames = audioPropInput.split(',').map(s => s.trim()).filter(s => s !== '');
					const language = this.getNodeParameter('audioLanguage', i, '') as string;
					const responseFormat = this.getNodeParameter('audioResponseFormat', i, 'verbose_json') as string;

					// 收集 Binary 数据
					const { binary: collectedBinary, bufferMap } = await collectBinaryFromNodes(this, i, binarySourceMode, specifiedNodes);

					// 提取音频文件
					const audioData = await extractAudioFromBinary(this, i, collectedBinary, propNames, bufferMap);

					if (!audioData) {
						throw new NodeOperationError(this.getNode(), '未找到音频文件');
					}

					const result = ACTIVE_AUDIO_BACKEND === 'whisper'
						? await transcribeWhisper(this, audioData, rawBaseUrl, credentials.apiKey as string, language, responseFormat)
						: { text: await transcribeOmni(this, audioData.buffer, rawBaseUrl, credentials.apiKey as string) };
					pushExecutionData(returnData, i, { json: result });
				}

				else if (mode === 'embeddings') {
					const model = this.getNodeParameter('embeddingModel', i) as string;
					const input = this.getNodeParameter('embeddingInput', i) as string;

					const responseData = await this.helpers.httpRequest({
						method: 'POST',
						url: `${rawBaseUrl}/embeddings`,
						headers: { Authorization: `Bearer ${credentials.apiKey}` },
						body: { model, input },
						json: true,
						timeout: REQUEST_TIMEOUT_MS,
					});
					pushExecutionData(returnData, i, { json: responseData });
				}
			} catch (error) {
				const errorObject = error as {
					message?: string;
					statusCode?: number;
					code?: string;
					response?: {
						status?: number;
						statusCode?: number;
						body?: unknown;
					};
				};
				debugLog('execute.error', {
					itemIndex: i,
					mode,
					message: errorObject?.message ?? String(error),
					statusCode: errorObject?.statusCode ?? errorObject?.response?.statusCode ?? errorObject?.response?.status ?? null,
					code: errorObject?.code ?? null,
					responseBody: typeof errorObject?.response?.body === 'string'
						? errorObject.response.body.slice(0, 500)
						: errorObject?.response?.body ?? null,
				});
				if (this.continueOnFail()) {
					const imageDownload = error instanceof NodeOperationError ? error.context.imageDownload : undefined;
					const imageUrl = asObject(imageDownload).imageUrl;
					pushExecutionData(returnData, i, { json: {
						error: error.message,
						...(imageDownload ? { imageDownload } : {}),
						...(typeof imageUrl === 'string' ? { imageUrl } : {}),
					} });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error);
			}
		}
		return [returnData];
	}
}
