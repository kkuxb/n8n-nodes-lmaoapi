import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE_FILE = '.upstream-sync-state.json';
const GENERATED_DIRECTORIES = new Set(['.git', 'dist', 'node_modules']);

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function normalizeText(content) {
	return content.replace(/\r\n/g, '\n');
}

function toPosixPath(filePath) {
	return filePath.split(path.sep).join('/');
}

function assertSafeRelativePath(filePath) {
	const normalized = toPosixPath(filePath);
	if (
		!normalized ||
		path.isAbsolute(filePath) ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.includes('/../')
	) {
		throw new Error(`Unsafe managed path: ${filePath}`);
	}
	return normalized;
}

function resolveManagedPath(root, relativePath) {
	const safePath = assertSafeRelativePath(relativePath);
	const resolvedRoot = path.resolve(root);
	const resolvedPath = path.resolve(resolvedRoot, ...safePath.split('/'));
	if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
		throw new Error(`Managed path escapes root: ${relativePath}`);
	}
	return resolvedPath;
}

function copyFile(sourceRoot, destinationRoot, relativePath) {
	const source = resolveManagedPath(sourceRoot, relativePath);
	const destination = resolveManagedPath(destinationRoot, relativePath);
	const sourceStat = fs.lstatSync(source);
	if (!sourceStat.isFile()) {
		throw new Error(`Managed path is not a regular file: ${relativePath}`);
	}
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.copyFileSync(source, destination);
}

function removeFileIfPresent(root, relativePath) {
	const target = resolveManagedPath(root, relativePath);
	if (!fs.existsSync(target)) return;
	if (!fs.lstatSync(target).isFile()) {
		throw new Error(`Refusing to remove non-file managed path: ${relativePath}`);
	}
	fs.rmSync(target, { force: true });

	let current = path.dirname(target);
	const resolvedRoot = path.resolve(root);
	while (current !== resolvedRoot && current.startsWith(`${resolvedRoot}${path.sep}`)) {
		try {
			fs.rmdirSync(current);
		} catch {
			break;
		}
		current = path.dirname(current);
	}
}

export function loadBrandConfig(configPath) {
	return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function replaceRequired(content, search, replacement, label) {
	if (!content.includes(search)) {
		throw new Error(`Missing required upstream anchor: ${label}`);
	}
	return content.replaceAll(search, replacement);
}

export function transformBrandDocument(content, config) {
	const { brand } = config;
	return normalizeText(content)
		.replaceAll('https://github.com/kkuxb/n8n-nodes-maibaoapi.git', brand.repository)
		.replaceAll('https://github.com/kkuxb/n8n-nodes-maibaoapi', brand.repositoryWeb)
		.replaceAll('n8n-nodes-MaibaoAPI', brand.packageName)
		.replaceAll('n8n-nodes-maibaoapi', brand.packageName)
		.replaceAll('https://maibaoapi.apifox.cn/', brand.apiOrigin)
		.replaceAll('https://api.maibao.chat', brand.alternativeApiOrigin)
		.replaceAll('https://ai.maibao.chat', brand.apiOrigin)
		.replaceAll('api.maibao.chat', new URL(brand.alternativeApiOrigin).host)
		.replaceAll('ai.maibao.chat', new URL(brand.apiOrigin).host)
		.replaceAll('MaibaoAPI', brand.displayName)
		.replaceAll('麦包 API Key', `${brand.displayName} API Key`)
		.replaceAll('麦包平台', '龙猫平台');
}

export function transformChangelog(content, config) {
	let output = transformBrandDocument(content, config).replace(
		'修正 README 对麦包返回格式控制能力的说明，区分 OpenAI 官方接口约定与麦包实测结果。',
		`更新 README 的返回格式说明，区分 OpenAI 官方约定与上游麦包实测；${config.brand.displayName} 跟随上游设置，线上响应行为尚未验证。`,
	);
	for (const patch of config.changelogPatches ?? []) {
		const missingEntries = patch.entries.filter((entry) => !output.includes(entry));
		if (missingEntries.length === 0) continue;
		const versionHeader = `## [${patch.version}]`;
		const versionStart = output.indexOf(versionHeader);
		if (versionStart === -1) {
			throw new Error(`Missing changelog version for brand patch: ${patch.version}`);
		}
		const nextVersionStart = output.indexOf('\n## [', versionStart + versionHeader.length);
		const insertAt = nextVersionStart === -1 ? output.length : nextVersionStart;
		const sectionHeader = `\n### ${patch.section}\n`;
		const sectionStart = output.indexOf(sectionHeader, versionStart);
		if (sectionStart !== -1 && sectionStart < insertAt) {
			const entriesStart = sectionStart + sectionHeader.length;
			output = `${output.slice(0, entriesStart)}\n${missingEntries.map((entry) => `- ${entry}`).join('\n')}\n${output.slice(entriesStart)}`;
			continue;
		}
		const addition = `\n### ${patch.section}\n\n${missingEntries.map((entry) => `- ${entry}`).join('\n')}\n`;
		output = `${output.slice(0, insertAt).trimEnd()}\n${addition}${output.slice(insertAt).replace(/^\n/, '')}`;
	}
	return output;
}

function transformKeyword(keyword, config) {
	if (keyword === 'maibaoapi') return 'lmaoapi';
	if (keyword === 'maibao') return 'lmao';
	return transformBrandDocument(keyword, config);
}

export function transformPackageJson(upstreamPackage, config) {
	const { brand } = config;
	return {
		...cloneJson(upstreamPackage),
		name: brand.packageName,
		description: transformBrandDocument(upstreamPackage.description, config),
		homepage: brand.homepage,
		keywords: (upstreamPackage.keywords ?? []).map((keyword) => transformKeyword(keyword, config)),
		repository: { type: 'git', url: brand.repository },
		bugs: { url: brand.issues },
		packageManager: brand.packageManager,
		engines: { node: brand.nodeEngine },
		scripts: {
			...upstreamPackage.scripts,
			'sync-upstream': 'node scripts/sync-upstream.mjs',
			test: 'node --test test/*.test.js',
		},
	};
}

export function transformPackageLock(upstreamLock, brandedPackage) {
	const output = cloneJson(upstreamLock);
	if (!output.packages?.['']) {
		throw new Error('Upstream package-lock.json is missing packages[""]');
	}

	output.name = brandedPackage.name;
	output.version = brandedPackage.version;
	output.packages[''] = {
		...output.packages[''],
		name: brandedPackage.name,
		version: brandedPackage.version,
		engines: brandedPackage.engines,
		devDependencies: brandedPackage.devDependencies,
		peerDependencies: brandedPackage.peerDependencies,
	};
	return output;
}

export function transformNodeSource(content, config) {
	const { brand } = config;
	let output = normalizeText(content);
	for (const [anchor, label] of [
		["displayName: 'MaibaoAPI'", 'node display name'],
		["name: 'maibaoApi'", 'node internal credential name'],
		["icon: 'file:maibaoapi.svg'", 'node icon'],
		["credentials: [{ name: 'maibaoApi', required: true }]", 'node credential declaration'],
		["this.getCredentials('maibaoApi')", 'node credential lookup'],
		[
			"\t\tconst rawBaseUrl = (credentials.baseUrl as string).replace(/\\/$/, '');\n\t\tconst soraBaseUrl = rawBaseUrl.replace(/\\/v1$/, '');",
			'node Base URL initialization',
		],
	]) {
		if (!output.includes(anchor)) {
			throw new Error(`Missing required upstream anchor: ${label}`);
		}
	}

	output = output
		.replaceAll('MaibaoAPI', brand.displayName)
		.replaceAll("'maibaoApi'", `'${brand.credentialName}'`)
		.replaceAll('file:maibaoapi.png', 'file:maibaoapi.svg')
		.replaceAll('https://api.maibao.chat', brand.apiOrigin);
	output = output.replace(
		"\t\tconst rawBaseUrl = (credentials.baseUrl as string).replace(/\\/$/, '');\n\t\tconst soraBaseUrl = rawBaseUrl.replace(/\\/v1$/, '');",
		[
			`\t\tconst configuredBaseUrl = (credentials.${brand.credentialBaseUrlName} as string | undefined)?.trim();`,
			'\t\tconst legacyBaseUrl = (credentials.baseUrl as string | undefined)?.trim();',
			'\t\tconst legacyCustomBaseUrl =',
			'\t\t\tlegacyBaseUrl && !/^https:\\/\\/(?:api|ai)\\.maibao\\.chat(?:\\/v1)?\\/?$/i.test(legacyBaseUrl)',
			'\t\t\t\t? legacyBaseUrl',
			'\t\t\t\t: undefined;',
			`\t\tconst baseUrl = (configuredBaseUrl || legacyCustomBaseUrl || '${brand.apiOrigin}').replace(/\\/+$/, '');`,
			"\t\tconst rawBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;",
			"\t\tconst soraBaseUrl = rawBaseUrl.replace(/\\/v1$/, '');",
		].join('\n'),
	);

	if (!output.startsWith('/* eslint-disable')) {
		output = `/* eslint-disable n8n-nodes-base/node-filename-against-convention */\n${output}`;
	}
	return output;
}

export function transformCredentialSource(content, config) {
	const { brand } = config;
	let output = normalizeText(content);
	for (const [anchor, label] of [
		["name = 'maibaoApi';", 'credential internal name'],
		["displayName = 'MaibaoAPI API';", 'credential display name'],
		["name: 'baseUrl',", 'credential Base URL property name'],
		["type: 'options',", 'credential Base URL type'],
		["value: 'https://api.maibao.chat/v1',", 'credential alternative API URL'],
		["value: 'https://ai.maibao.chat/v1',", 'credential default API URL'],
		["default: 'https://ai.maibao.chat/v1',", 'credential Base URL default'],
		["baseURL: '={{$credentials.baseUrl}}',", 'credential test base URL'],
		["url: '/models',", 'credential test URL'],
	]) {
		if (!output.includes(anchor)) {
			throw new Error(`Missing required upstream anchor: ${label}`);
		}
	}

	output = output
		.replaceAll("name = 'maibaoApi';", `name = '${brand.credentialName}';`)
		.replaceAll("displayName = 'MaibaoAPI API';", `displayName = '${brand.displayName} API';`)
		.replaceAll('file:maibaoapi.png', 'file:maibaoapi.svg')
		.replaceAll("documentationUrl = 'https://maibaoapi.apifox.cn/';", `documentationUrl = '${brand.apiOrigin}';`)
		.replaceAll("name: 'baseUrl',", `name: '${brand.credentialBaseUrlName}',`)
		.replaceAll('https://api.maibao.chat', brand.alternativeApiOrigin)
		.replaceAll('https://ai.maibao.chat', brand.apiOrigin)
		.replaceAll(
			"baseURL: '={{$credentials.baseUrl}}',",
			String.raw`baseURL: '={{($credentials.${brand.credentialBaseUrlName} || "${brand.apiBaseUrl}").trim().replace(/\\/+$/, "").replace(/(?:\\/v1)?$/, "/v1")}}',`,
		);
	return output;
}

export function transformReadme(content, config) {
	let output = transformBrandDocument(content, config)
		.replaceAll('`master`', `\`${config.brand.branch}\``)
		.replaceAll('Node.js `22.x`', 'Node.js `24.x`')
		.replaceAll('`.n8n-dev-server/`', '`.n8n-dev-server-node24/`')
		.replaceAll('`.npm-n8n-cache/`', '`.npm-n8n-cache-node24/`')
		.replaceAll('优先切到 Node.js 22', '优先确认当前 shell 使用 Node.js 24')
		.replaceAll('先构建，再运行全部 Node.js 回归测试', '运行全部回归测试（需先构建）')
		.replaceAll('但 2026-10-09 的麦包', '但上游在 2026-10-09 对麦包服务的')
		.replaceAll('本节点据此向麦包固定请求 Base64', `本节点跟随上游向 ${config.brand.displayName} 固定请求 Base64`)
		.replaceAll('两个 GPT-Image-2.5 模型及参考图编辑接口尚未完成该参数的在线验证。', `两个 GPT-Image-2.5 模型及参考图编辑接口尚未完成该参数的在线验证；${config.brand.displayName} 的线上响应行为也尚未验证。`)
		.replace(/npm run release -- \d+\.\d+\.\d+ --npm\.allowSameVersion/g, 'npm run release -- --no-increment')
		.replace(/如果已手动更新版本号[^\n]+：/, '版本号已更新时，使用 `--no-increment` 保持 package.json 中的版本不变：')
		.replace('GitHub 发布需要配置相应认证。', 'GitHub 发布说明自动读取 CHANGELOG 对应版本。需要设置 `GITHUB_TOKEN`；已登录 GitHub CLI 时，可在 PowerShell 中执行 `$env:GITHUB_TOKEN = gh auth token`。');
	for (const patch of config.changelogPatches ?? []) {
		const heading = `## ${patch.version} 更新内容\n`;
		if (!output.includes(heading)) continue;
		const additions = patch.entries.filter((entry) => !output.includes(entry));
		if (additions.length) {
			output = output.replace(heading, `${heading}\n${additions.map((entry) => `- ${entry}`).join('\n')}\n`);
		}
	}
	return output;
}

export function transformDeveloperDocument(content, config) {
	return transformBrandDocument(content, config)
		.replace(/npm run release -- \d+\.\d+\.\d+ --npm\.allowSameVersion/g, 'npm run release -- --no-increment')
		.replace(/\(replace `\d+\.\d+\.\d+` with the target version\)/g, '(uses the version already in package.json)')
		.replaceAll('`master`', `\`${config.brand.branch}\``)
		.replaceAll('Node.js 22', 'Node.js 24')
		.replaceAll('**Node Version:** 22', '**Node Version:** 24')
		.replace(/`npm test` builds and runs \w+ test files/g, 'After building, `npm test` runs all test files')
		.replaceAll('Run `npm test` locally to build and execute', 'Run `npm run build` followed by `npm test` locally to execute');
}

export function transformGitignore(content) {
	const requiredEntries = ['.tmp-upstream-*/', '.tmp-upstream-full-*/', '.tmp-upstream-sync-*/'];
	const lines = normalizeText(content).trimEnd().split('\n');
	for (const entry of requiredEntries) {
		if (!lines.includes(entry)) lines.push(entry);
	}
	return `${lines.join('\n')}\n`;
}

export function transformCiWorkflow(content, config) {
	let output = normalizeText(content)
		.replace(/node-version: ['"]22['"]/, "node-version: '24'")
		.replace(/^(\s*- )master$/m, `$1${config.brand.branch}`);
	if (!output.includes('LANG: zh_CN.UTF-8')) {
		output = output.replace('    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    env:\n      LANG: zh_CN.UTF-8');
	}
	if (!output.includes('npm test')) {
		output = `${output.trimEnd()}\n\n      - name: Run tests\n        run: 'npm test'\n`;
	}
	if (!output.includes('npm run build')) {
		output = output.replace("run: 'npm test'", "run: 'npm run build && npm test'");
	}
	return output;
}

export function transformDevScript(content) {
	let output = normalizeText(content);
	for (const [anchor, label] of [
		[
			"const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0], 10);",
			'dev runtime constants',
		],
		['function readInstalledN8nVersion() {', 'dev runtime helper insertion'],
		['bootstrapPersistentN8nInstall();', 'dev runtime startup'],
	]) {
		if (!output.includes(anchor)) {
			throw new Error(`Missing required upstream anchor: ${label}`);
		}
	}

	const cacheConstants = [
		"const n8nRuntimeFolder = path.join(n8nUserFolder, '.n8n');",
		"const customNodeModulesFolder = path.join(n8nRuntimeFolder, 'custom', 'node_modules');",
		"const staleUpstreamPackageLink = path.join(customNodeModulesFolder, 'n8n-nodes-maibaoapi');",
		"const generatedTypesFolder = path.join(n8nUserFolder, '.cache', 'n8n', 'public', 'types');",
		"const generatedCustomIconsFolder = path.join(n8nUserFolder, '.cache', 'n8n', 'public', 'icons', 'CUSTOM');",
	].join('\n');
	output = output.replace(
		"const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0], 10);",
		`const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0], 10);\n${cacheConstants}`,
	);

	const cacheHelpers = [
		'function removePathIfExists(targetPath, options = {}) {',
		'\tif (!fs.existsSync(targetPath)) return;',
		'',
		'\ttry {',
		'\t\tfs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });',
		'\t} catch (error) {',
		'\t\tif (!options.required) {',
		'\t\t\tconsole.warn(`[n8n Server] Could not clear cache path: ${targetPath}`);',
		'\t\t\tconsole.warn(error.message);',
		'\t\t\treturn;',
		'\t\t}',
		'',
		'\t\tconsole.error([',
		'\t\t\t`[n8n Server] Could not remove stale upstream package link: ${targetPath}`,',
		"\t\t\t'',",
		"\t\t\t'Stop any running npm run dev / n8n process, then remove this stale link and retry:',",
		'\t\t\t`  Remove-Item -LiteralPath "${targetPath}" -Force`,',
		"\t\t\t'',",
		"\t\t\t'This old MaibaoAPI package makes n8n show upstream node and credential metadata instead of LmaoAPI.',",
		"\t\t].join('\\n'));",
		'\t\tprocess.exit(1);',
		'\t}',
		'}',
		'',
		'function resetGeneratedN8nCustomNodeCache() {',
		'\tremovePathIfExists(staleUpstreamPackageLink, { required: true });',
		'',
		"\tfor (const fileName of ['credentials.json', 'nodes.json', 'node-versions.json']) {",
		'\t\tremovePathIfExists(path.join(generatedTypesFolder, fileName));',
		'\t}',
		'',
		'\tremovePathIfExists(generatedCustomIconsFolder);',
		'}',
		'',
	].join('\n');
	output = output.replace(
		'function readInstalledN8nVersion() {',
		`${cacheHelpers}function readInstalledN8nVersion() {`,
	);
	output = output.replace(
		'bootstrapPersistentN8nInstall();',
		'bootstrapPersistentN8nInstall();\nresetGeneratedN8nCustomNodeCache();',
	);
	return output;
}

export function transformDevScriptTest(content) {
	const output = normalizeText(content).trimEnd();
	if (output.includes("test('dev script clears stale upstream custom node cache before startup'")) {
		return `${output}\n`;
	}
	return `${output}\n\n${[
		"test('dev script clears stale upstream custom node cache before startup', () => {",
		'\tassert.match(devScript, /n8n-nodes-maibaoapi/);',
		'\tassert.match(devScript, /credentials\\.json/);',
		'\tassert.match(devScript, /nodes\\.json/);',
		'\tassert.match(devScript, /node-versions\\.json/);',
		'\tassert.match(devScript, /resetGeneratedN8nCustomNodeCache\\(\\);/);',
		'\tassert.match(devScript, /Could not remove stale upstream package link/);',
		'});',
	].join('\n')}\n`;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value, indentation = '\t') {
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, indentation)}\n`);
}

function copyLocalOwnedFiles(projectRoot, candidateRoot, config) {
	for (const relativePath of config.localOwnedFiles) {
		if (!fs.existsSync(resolveManagedPath(projectRoot, relativePath))) {
			throw new Error(`Missing required local-owned file: ${relativePath}`);
		}
		copyFile(projectRoot, candidateRoot, relativePath);
	}
}

export function listManagedFiles(root) {
	const results = [];
	function visit(currentRoot) {
		for (const entry of fs.readdirSync(currentRoot, { withFileTypes: true })) {
			if (entry.isDirectory() && GENERATED_DIRECTORIES.has(entry.name)) continue;
			const fullPath = path.join(currentRoot, entry.name);
			const relativePath = toPosixPath(path.relative(root, fullPath));
			if (entry.isDirectory()) {
				visit(fullPath);
			} else if (entry.isFile()) {
				results.push(assertSafeRelativePath(relativePath));
			} else {
				throw new Error(`Unsupported upstream filesystem entry: ${relativePath}`);
			}
		}
	}
	visit(root);
	return results.sort();
}

export function prepareCandidate({ projectRoot, candidateRoot, config, upstreamCommit }) {
	for (const relativePath of config.retiredPaths) {
		removeFileIfPresent(candidateRoot, relativePath);
	}
	copyLocalOwnedFiles(projectRoot, candidateRoot, config);

	const upstreamPackage = readJson(path.join(candidateRoot, 'package.json'));
	const brandedPackage = transformPackageJson(upstreamPackage, config);
	writeJson(path.join(candidateRoot, 'package.json'), brandedPackage);
	writeJson(
		path.join(candidateRoot, 'package-lock.json'),
		transformPackageLock(readJson(path.join(candidateRoot, 'package-lock.json')), brandedPackage),
	);

	const nodePath = path.join(candidateRoot, 'nodes', 'MaibaoApi', 'MaibaoApi.node.ts');
	fs.writeFileSync(nodePath, transformNodeSource(fs.readFileSync(nodePath, 'utf8'), config));
	const credentialPath = path.join(candidateRoot, 'credentials', 'MaibaoApi.credentials.ts');
	fs.writeFileSync(
		credentialPath,
		transformCredentialSource(fs.readFileSync(credentialPath, 'utf8'), config),
	);

	for (const relativePath of [
		'CHANGELOG.md',
		'CLAUDE.md',
		'PROJECT_INDEX.md',
		'test_timestamp_granularities.bat',
	]) {
		const fullPath = path.join(candidateRoot, relativePath);
		if (fs.existsSync(fullPath)) {
			const content = fs.readFileSync(fullPath, 'utf8');
			fs.writeFileSync(
				fullPath,
				relativePath === 'CHANGELOG.md'
					? transformChangelog(content, config)
					: transformDeveloperDocument(content, config),
			);
		}
	}
	const readmePath = path.join(candidateRoot, 'README.md');
	fs.writeFileSync(readmePath, transformReadme(fs.readFileSync(readmePath, 'utf8'), config));

	const projectIndexPath = path.join(candidateRoot, 'PROJECT_INDEX.json');
	if (fs.existsSync(projectIndexPath)) {
		const projectIndex = JSON.parse(
			transformBrandDocument(fs.readFileSync(projectIndexPath, 'utf8'), config),
		);
		projectIndex.version = brandedPackage.version;
		projectIndex.projectName = config.brand.packageName;
		projectIndex.repository = config.brand.repository.replace(/^git\+/, '');
		projectIndex.scripts = brandedPackage.scripts;
		if (projectIndex.modules?.MaibaoApiCredentials) {
			projectIndex.modules.MaibaoApiCredentials.properties = ['apiKey', config.brand.credentialBaseUrlName];
		}
		if (projectIndex.statistics) {
			projectIndex.statistics.testFiles = fs.readdirSync(path.join(candidateRoot, 'test')).filter((file) => file.endsWith('.test.js')).length;
		}
		if (projectIndex.release) {
			projectIndex.release.branch = config.brand.branch;
			projectIndex.release.releaseNotes = 'CHANGELOG.md';
		}
		if (projectIndex.ci) {
			projectIndex.ci.nodeVersion = config.brand.nodeEngine.replace('.x', '');
			projectIndex.ci.triggers = projectIndex.ci.triggers.map((trigger) =>
				trigger === 'push:master' ? `push:${config.brand.branch}` : trigger,
			);
			if (!projectIndex.ci.steps.includes('npm test')) projectIndex.ci.steps.push('npm test');
			if (!projectIndex.ci.steps.includes('npm run build')) {
				projectIndex.ci.steps.splice(projectIndex.ci.steps.indexOf('npm test'), 0, 'npm run build');
			}
		}
		if (Array.isArray(projectIndex.credentials?.type?.properties)) {
			projectIndex.credentials.type.properties = projectIndex.credentials.type.properties.map((property) =>
				property === 'baseUrl' ? config.brand.credentialBaseUrlName : property,
			);
		}
		projectIndex.keywords = projectIndex.keywords?.map((keyword) => transformKeyword(keyword, config));
		writeJson(projectIndexPath, projectIndex, 2);
	}
	const projectIndexMarkdownPath = path.join(candidateRoot, 'PROJECT_INDEX.md');
	if (fs.existsSync(projectIndexMarkdownPath)) {
		const projectIndexMarkdown = fs
			.readFileSync(projectIndexMarkdownPath, 'utf8')
			.replace(
				'`baseUrl` - Selectable API base URL',
				`\`${config.brand.credentialBaseUrlName}\` - Selectable API base URL`,
			);
		fs.writeFileSync(projectIndexMarkdownPath, projectIndexMarkdown);
	}

	const gitignorePath = path.join(candidateRoot, '.gitignore');
	fs.writeFileSync(gitignorePath, transformGitignore(fs.readFileSync(gitignorePath, 'utf8')));
	const ciPath = path.join(candidateRoot, '.github', 'workflows', 'ci.yml');
	if (fs.existsSync(ciPath)) {
		fs.writeFileSync(ciPath, transformCiWorkflow(fs.readFileSync(ciPath, 'utf8'), config));
	}
	const releaseConfigPath = path.join(candidateRoot, '.release-it.json');
	if (fs.existsSync(releaseConfigPath)) {
		const releaseConfig = readJson(releaseConfigPath);
		releaseConfig.git.requireBranch = config.brand.branch;
		releaseConfig.git.changelog = 'node scripts/release-notes.mjs';
		releaseConfig.npm.publish = false;
		releaseConfig.github.releaseNotes = 'node scripts/release-notes.mjs ${version}';
		writeJson(releaseConfigPath, releaseConfig);
	}
	const credentialTestPath = path.join(candidateRoot, 'test', 'credentials.test.js');
	fs.writeFileSync(
		credentialTestPath,
		transformBrandDocument(fs.readFileSync(credentialTestPath, 'utf8'), config).replaceAll(
			"property.name === 'baseUrl'",
			`property.name === '${config.brand.credentialBaseUrlName}'`,
		),
	);
	const devScriptPath = path.join(candidateRoot, 'scripts', 'dev.mjs');
	fs.writeFileSync(devScriptPath, transformDevScript(fs.readFileSync(devScriptPath, 'utf8')));
	const devScriptTestPath = path.join(candidateRoot, 'test', 'dev-script-config.test.js');
	fs.writeFileSync(
		devScriptTestPath,
		transformDevScriptTest(fs.readFileSync(devScriptTestPath, 'utf8')),
	);

	const managedPaths = [...listManagedFiles(candidateRoot), STATE_FILE].sort();
	const state = {
		upstream: {
			url: config.upstream.url,
			branch: config.upstream.branch,
			commit: upstreamCommit,
			version: brandedPackage.version,
		},
		managedPaths,
	};
	writeJson(path.join(candidateRoot, STATE_FILE), state, 2);
	return state;
}

export function assertCandidateBranding(candidateRoot, config, expectedVersion) {
	const packageJson = readJson(path.join(candidateRoot, 'package.json'));
	const packageLock = readJson(path.join(candidateRoot, 'package-lock.json'));
	if (packageJson.version !== expectedVersion || packageLock.version !== expectedVersion) {
		throw new Error(`Version invariant failed: expected ${expectedVersion}`);
	}
	if (packageJson.name !== config.brand.packageName || packageLock.name !== config.brand.packageName) {
		throw new Error('Package brand invariant failed');
	}

	const brandSurfaces = [
		'README.md',
		'CHANGELOG.md',
		'package.json',
		'package-lock.json',
		'credentials/MaibaoApi.credentials.ts',
		'test_timestamp_granularities.bat',
	];
	const forbidden = /MaibaoAPI|maibaoApi|(?:api|ai)\.maibao\.chat|n8n-nodes-maibaoapi/;
	for (const relativePath of brandSurfaces) {
		const content = fs.readFileSync(resolveManagedPath(candidateRoot, relativePath), 'utf8');
		if (forbidden.test(content)) {
			throw new Error(`Upstream brand leaked into ${relativePath}`);
		}
	}
	const nodeSource = fs.readFileSync(
		resolveManagedPath(candidateRoot, 'nodes/MaibaoApi/MaibaoApi.node.ts'),
		'utf8',
	);
	if (/MaibaoAPI|maibaoApi|n8n-nodes-maibaoapi/.test(nodeSource)) {
		throw new Error('Upstream brand leaked into nodes/MaibaoApi/MaibaoApi.node.ts');
	}
	if (
		!nodeSource.includes(`credentials.${config.brand.credentialBaseUrlName}`) ||
		!nodeSource.includes(`'${config.brand.apiOrigin}'`)
	) {
		throw new Error('Node Base URL migration invariant failed');
	}
	const credentialSource = fs.readFileSync(
		resolveManagedPath(candidateRoot, 'credentials/MaibaoApi.credentials.ts'),
		'utf8',
	);
	if (
		!credentialSource.includes(`name: '${config.brand.credentialBaseUrlName}'`) ||
		!credentialSource.includes("type: 'options'") ||
		!credentialSource.includes(`default: '${config.brand.apiBaseUrl}'`) ||
		!credentialSource.includes(`value: '${config.brand.apiBaseUrl}'`) ||
		!credentialSource.includes(`value: '${config.brand.alternativeApiOrigin}/v1'`)
	) {
		throw new Error('Credential Base URL invariant failed');
	}

	const changelog = fs.readFileSync(path.join(candidateRoot, 'CHANGELOG.md'), 'utf8');
	if (!changelog.includes(`## [${expectedVersion}]`)) {
		throw new Error(`CHANGELOG.md does not contain upstream version ${expectedVersion}`);
	}
	for (const relativePath of [
		'credentials/maibaoapi.svg',
		'nodes/MaibaoApi/maibaoapi.svg',
	]) {
		if (!fs.existsSync(resolveManagedPath(candidateRoot, relativePath))) {
			throw new Error(`Missing branded logo: ${relativePath}`);
		}
	}
}

export function readSyncState(projectRoot) {
	const statePath = path.join(projectRoot, STATE_FILE);
	if (!fs.existsSync(statePath)) return null;
	const state = readJson(statePath);
	if (!Array.isArray(state.managedPaths)) {
		throw new Error(`${STATE_FILE} is missing managedPaths`);
	}
	return state;
}

export function compareManagedSnapshot({ sourceRoot, destinationRoot, previousManagedPaths, nextManagedPaths }) {
	const changed = new Set();
	const nextSet = new Set(nextManagedPaths.map(assertSafeRelativePath));
	for (const relativePath of previousManagedPaths.map(assertSafeRelativePath)) {
		if (!nextSet.has(relativePath) && fs.existsSync(resolveManagedPath(destinationRoot, relativePath))) {
			changed.add(relativePath);
		}
	}
	for (const relativePath of nextSet) {
		const source = resolveManagedPath(sourceRoot, relativePath);
		const destination = resolveManagedPath(destinationRoot, relativePath);
		if (!fs.existsSync(destination) || !fs.readFileSync(source).equals(fs.readFileSync(destination))) {
			changed.add(relativePath);
		}
	}
	return [...changed].sort();
}

export function applyManagedSnapshot({ sourceRoot, destinationRoot, previousManagedPaths, nextManagedPaths }) {
	const previous = previousManagedPaths.map(assertSafeRelativePath);
	const next = nextManagedPaths.map(assertSafeRelativePath);
	const targets = [...new Set([...previous, ...next])].sort();
	const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lmao-upstream-rollback-'));

	try {
		for (const relativePath of targets) {
			const currentPath = resolveManagedPath(destinationRoot, relativePath);
			if (fs.existsSync(currentPath)) copyFile(destinationRoot, backupRoot, relativePath);
		}

		const nextSet = new Set(next);
		for (const relativePath of previous) {
			if (!nextSet.has(relativePath)) removeFileIfPresent(destinationRoot, relativePath);
		}
		for (const relativePath of next) copyFile(sourceRoot, destinationRoot, relativePath);
	} catch (error) {
		for (const relativePath of targets) {
			const backupPath = resolveManagedPath(backupRoot, relativePath);
			if (fs.existsSync(backupPath)) {
				copyFile(backupRoot, destinationRoot, relativePath);
			} else {
				removeFileIfPresent(destinationRoot, relativePath);
			}
		}
		throw new Error(`Snapshot apply failed and was rolled back: ${error.message}`, { cause: error });
	} finally {
		fs.rmSync(backupRoot, { recursive: true, force: true });
	}
}

export { STATE_FILE };
