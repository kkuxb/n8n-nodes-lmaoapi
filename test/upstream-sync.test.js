const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const libraryPromise = import('../scripts/upstream-sync-lib.mjs');
const config = require('../scripts/upstream-brand.json');

const upstreamPackage = {
	name: 'n8n-nodes-maibaoapi',
	version: '9.8.7',
	description: '便捷调用 MaibaoAPI。',
	license: 'MIT',
	homepage: '',
	keywords: ['n8n-nodes-maibaoapi', 'maibaoapi', '文字生成'],
	repository: { type: 'git', url: 'https://github.com/kkuxb/n8n-nodes-maibaoapi.git' },
	scripts: { build: 'n8n-node build', lint: 'n8n-node lint' },
	devDependencies: { typescript: '5.9.2' },
	peerDependencies: { 'n8n-workflow': '*' },
};

const upstreamNode = `export class MaibaoApi {
	description = {
		displayName: 'MaibaoAPI',
		name: 'maibaoApi',
		icon: 'file:maibaoapi.png',
		description: '调用 MaibaoAPI',
		defaults: { name: 'MaibaoAPI' },
		credentials: [{ name: 'maibaoApi', required: true }],
	};
	async execute() { return this.getCredentials('maibaoApi'); }
}`;

const upstreamCredential = `export class MaibaoApi {
	name = 'maibaoApi';
	displayName = 'MaibaoAPI API';
	icon = { light: 'file:maibaoapi.png', dark: 'file:maibaoapi.png' } as const;
	documentationUrl = 'https://maibaoapi.apifox.cn/';
	properties = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.maibao.chat/v1',
		},
	];
	test = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
			headers: {},
		},
	};
}`;

test('package metadata follows upstream version and dependencies while retaining LmaoAPI identity', async () => {
	const { transformPackageJson } = await libraryPromise;
	const output = transformPackageJson(upstreamPackage, config);

	assert.equal(output.version, '9.8.7');
	assert.equal(output.name, 'n8n-nodes-lmaoapi');
	assert.equal(output.description, '便捷调用 LmaoAPI。');
	assert.equal(output.repository.url, 'git+https://github.com/kkuxb/n8n-nodes-lmaoapi.git');
	assert.deepEqual(output.devDependencies, upstreamPackage.devDependencies);
	assert.equal(output.scripts['sync-upstream'], 'node scripts/sync-upstream.mjs');
	assert.equal(output.scripts.test, 'node --test test/*.test.js');
});

test('package lock keeps the upstream dependency graph and updates branded root metadata', async () => {
	const { transformPackageJson, transformPackageLock } = await libraryPromise;
	const brandedPackage = transformPackageJson(upstreamPackage, config);
	const upstreamLock = {
		name: 'n8n-nodes-maibaoapi',
		version: '9.8.7',
		lockfileVersion: 3,
		packages: {
			'': { name: 'n8n-nodes-maibaoapi', version: '9.8.7', devDependencies: { typescript: '5.9.2' } },
			'node_modules/typescript': { version: '5.9.2' },
		},
	};
	const output = transformPackageLock(upstreamLock, brandedPackage);

	assert.equal(output.name, 'n8n-nodes-lmaoapi');
	assert.equal(output.version, '9.8.7');
	assert.equal(output.packages[''].name, 'n8n-nodes-lmaoapi');
	assert.deepEqual(output.packages['node_modules/typescript'], { version: '5.9.2' });
});

test('node and credential transforms preserve LmaoAPI names, SVG logos, and configurable API URL', async () => {
	const { transformCredentialSource, transformNodeSource } = await libraryPromise;
	const node = transformNodeSource(upstreamNode, config);
	const credential = transformCredentialSource(upstreamCredential, config);

	assert.match(node, /displayName: 'LmaoAPI'/);
	assert.match(node, /name: 'lmaoApi'/);
	assert.match(node, /file:maibaoapi\.svg/);
	assert.match(node, /getCredentials\('lmaoApi'\)/);
	assert.match(credential, /type: 'string'/);
	assert.match(credential, /https:\/\/api\.lmao\.net\.cn\/v1/);
	assert.match(credential, /高级覆盖项/);
	assert.doesNotMatch(`${node}\n${credential}`, /MaibaoAPI|maibaoApi|api\.maibao\.chat/);
});

test('required branding anchors fail closed when upstream structure changes', async () => {
	const { transformCredentialSource, transformNodeSource } = await libraryPromise;

	assert.throws(() => transformNodeSource('export class MaibaoApi {}', config), /Missing required upstream anchor/);
	assert.throws(() => transformCredentialSource("name = 'maibaoApi';", config), /Missing required upstream anchor/);
});

test('brand documents retain upstream change content and replace only identity and URLs', async () => {
	const { transformBrandDocument } = await libraryPromise;
	const result = transformBrandDocument(
		'## [9.8.7]\n- MaibaoAPI 新增功能 X\n- https://api.maibao.chat/v1\n- https://github.com/kkuxb/n8n-nodes-maibaoapi/releases',
		config,
	);

	assert.match(result, /## \[9\.8\.7\]/);
	assert.match(result, /LmaoAPI 新增功能 X/);
	assert.match(result, /https:\/\/api\.lmao\.net\.cn\/v1/);
	assert.match(result, /n8n-nodes-lmaoapi\/releases/);
});

test('dev tooling follows its upstream source and adds only the brand cache cleanup overlay', async () => {
	const { transformDevScript, transformDevScriptTest } = await libraryPromise;
	const upstreamDevScript = [
		"const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0], 10);",
		'function readInstalledN8nVersion() { return null; }',
		'bootstrapPersistentN8nInstall();',
	].join('\n');
	const upstreamTest = "test('upstream behavior', () => {});\n";
	const devScript = transformDevScript(upstreamDevScript);
	const devTest = transformDevScriptTest(upstreamTest);

	assert.match(devScript, /n8n-nodes-maibaoapi/);
	assert.match(devScript, /resetGeneratedN8nCustomNodeCache\(\);/);
	assert.match(devScript, /bootstrapPersistentN8nInstall\(\);\nresetGeneratedN8nCustomNodeCache\(\);/);
	assert.match(devTest, /upstream behavior/);
	assert.match(devTest, /clears stale upstream custom node cache/);
});

test('managed snapshot removes retired files and copies the complete candidate', async (t) => {
	const { applyManagedSnapshot } = await libraryPromise;
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upstream-sync-test-'));
	const source = path.join(root, 'source');
	const destination = path.join(root, 'destination');
	fs.mkdirSync(source);
	fs.mkdirSync(destination);
	fs.writeFileSync(path.join(source, 'kept.txt'), 'upstream');
	fs.writeFileSync(path.join(destination, 'kept.txt'), 'old');
	fs.writeFileSync(path.join(destination, 'removed.txt'), 'obsolete');
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	applyManagedSnapshot({
		sourceRoot: source,
		destinationRoot: destination,
		previousManagedPaths: ['kept.txt', 'removed.txt'],
		nextManagedPaths: ['kept.txt'],
	});

	assert.equal(fs.readFileSync(path.join(destination, 'kept.txt'), 'utf8'), 'upstream');
	assert.equal(fs.existsSync(path.join(destination, 'removed.txt')), false);
});
