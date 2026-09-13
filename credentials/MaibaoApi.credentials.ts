import { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

export class MaibaoApi implements ICredentialType {
	name = 'lmaoApi';
	displayName = 'LmaoAPI API';
	icon = { light: 'file:maibaoapi.svg', dark: 'file:maibaoapi.svg' } as const;
	documentationUrl = 'https://ai.lmao.net.cn';
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'API 地址',
			name: 'lmaoBaseUrl',
			type: 'options',
			options: [
				{
					name: 'https://api.lmao.net.cn',
					value: 'https://api.lmao.net.cn/v1',
				},
				{
					name: 'https://ai.lmao.net.cn',
					value: 'https://ai.lmao.net.cn/v1',
				},
			],
			default: 'https://ai.lmao.net.cn/v1',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{($credentials.lmaoBaseUrl || "https://ai.lmao.net.cn/v1").trim().replace(/\\/+$/, "").replace(/(?:\\/v1)?$/, "/v1")}}',
			url: '/models',
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}
