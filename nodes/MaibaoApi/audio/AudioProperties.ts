import { INodeProperties } from 'n8n-workflow';
import { AudioBackend } from './AudioBackend';

export function audioProperties(backend: AudioBackend): INodeProperties[] {
	const legacy: INodeProperties[] = [
		{
			displayName: '音频语言',
			name: 'audioLanguage',
			type: 'options',
			displayOptions: { show: { mode: ['audio'] } },
			options: [
				{ name: '自动识别', value: '' },
				{ name: '中文', value: 'zh' },
				{ name: '英语', value: 'en' },
			],
			default: '',
			description: '指定音频语言可以提高准确性和速度。留空则自动识别。',
		},
		{
			displayName: '输出格式',
			name: 'audioResponseFormat',
			type: 'options',
			displayOptions: { show: { mode: ['audio'] } },
			options: [
				{ name: '带时间戳的 JSON 格式', value: 'verbose_json' },
				{ name: '纯文本格式', value: 'text' },
			],
			default: 'verbose_json',
			description: 'Verbose_json 包含分段文本和时间戳信息，text 仅返回纯文本',
		},
	];
	return backend === 'whisper'
		? legacy
		: legacy.map(({ name, default: defaultValue }) => ({
				displayName: name,
				name,
				type: 'hidden',
				default: defaultValue,
			}));
}
