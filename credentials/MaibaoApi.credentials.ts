import { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';

export class MaibaoApi implements ICredentialType {
	name = 'lmaoApi';
	displayName = 'LmaoAPI API';
	icon = { light: 'file:maibaoapi.svg', dark: 'file:maibaoapi.svg' } as const;
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
			default: 'https://api.lmao.net.cn/v1',
			description: '高级覆盖项。默认使用 LmaoAPI 官方地址，仅在自定义兼容网关时修改。',
		},
	];
	test: ICredentialTestRequest = {
		request: {
			url: '={{(($credentials.baseUrl || "").replace(/\\/+$/, "").endsWith("/v1") ? ($credentials.baseUrl || "").replace(/\\/+$/, "") : ($credentials.baseUrl || "").replace(/\\/+$/, "") + "/v1") + "/models"}}',
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};
}