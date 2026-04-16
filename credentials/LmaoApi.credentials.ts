import { ICredentialType, ICredentialTestRequest, INodeProperties } from 'n8n-workflow';

export class LmaoApi implements ICredentialType {
	name = 'lmaoApi';
	displayName = 'LmaoAPI API';
	icon = {
		light: 'file:../nodes/LmaoApi/lmaoapi.png',
		dark: 'file:../nodes/LmaoApi/lmaoapi.png',
	} as const;
	documentationUrl = 'https://api.lmao.net.cn';
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
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.lmao.net.cn',
			description: '高级覆盖项。默认使用 LmaoAPI 官方地址，仅在自定义兼容网关时修改。',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}
