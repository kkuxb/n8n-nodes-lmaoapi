import { INodeProperties } from 'n8n-workflow';

export const videoUnderstandingProperties: INodeProperties[] = [
	{
		displayName: '视频 URL',
		name: 'videoUnderstandingUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: '填写可公开下载的 MP4 视频直链',
		displayOptions: { show: { mode: ['videoUnderstanding'] } },
		description:
			'任意域名的公网 HTTP(S) MP4 直链，无需登录且支持范围读取，最长1小时、最大2GB（按模型输入规格）。整片理解后输出带时间戳的画面和口播；内容与时间为模型估算，需人工核对。',
	},
];
