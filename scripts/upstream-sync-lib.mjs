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
		.replaceAll('https://api.maibao.chat', brand.apiOrigin)
		.replaceAll('MaibaoAPI', brand.displayName)
		.replaceAll('麦包平台', '龙猫平台');
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
		["icon: 'file:maibaoapi.png'", 'node icon'],
		["credentials: [{ name: 'maibaoApi', required: true }]", 'node credential declaration'],
		["this.getCredentials('maibaoApi')", 'node credential lookup'],
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
		["type: 'hidden',", 'credential Base URL type'],
		["default: 'https://api.maibao.chat/v1',", 'credential Base URL default'],
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
		.replaceAll("type: 'hidden',", "type: 'string',")
		.replaceAll(
			"default: 'https://api.maibao.chat/v1',",
			[
				`default: '${brand.apiBaseUrl}',`,
				`\t\t\tdescription: '高级覆盖项。默认使用 ${brand.displayName} 官方地址，仅在自定义兼容网关时修改。',`,
			].join('\n'),
		)
		.replaceAll(
			"\t\t\tbaseURL: '={{$credentials.baseUrl}}',\n\t\t\turl: '/models',",
			`\t\t\turl: '={{(($credentials.baseUrl || "").replace(/\\\\\/+$/, "").endsWith("/v1") ? ($credentials.baseUrl || "").replace(/\\\\\/+$/, "") : ($credentials.baseUrl || "").replace(/\\\\\/+$/, "") + "/v1") + "/models"}}',`,
		);
	return output;
}

export function transformReadme(content, config) {
	return transformBrandDocument(content, config)
		.replaceAll('Node.js `22.x`', 'Node.js `24.x`')
		.replaceAll('`.n8n-dev-server/`', '`.n8n-dev-server-node24/`')
		.replaceAll('`.npm-n8n-cache/`', '`.npm-n8n-cache-node24/`')
		.replaceAll('优先切到 Node.js 22', '优先确认当前 shell 使用 Node.js 24');
}

export function transformGitignore(content) {
	const requiredEntries = ['.tmp-upstream-*/', '.tmp-upstream-full-*/', '.tmp-upstream-sync-*/'];
	const lines = normalizeText(content).trimEnd().split('\n');
	for (const entry of requiredEntries) {
		if (!lines.includes(entry)) lines.push(entry);
	}
	return `${lines.join('\n')}\n`;
}

export function transformCiWorkflow(content) {
	let output = normalizeText(content).replace(/node-version: ['"]22['"]/, "node-version: '24'");
	if (!output.includes('npm test')) {
		output = `${output.trimEnd()}\n\n      - name: Run tests\n        run: 'npm test'\n`;
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

	for (const relativePath of ['CHANGELOG.md', 'CLAUDE.md', 'PROJECT_INDEX.md']) {
		const fullPath = path.join(candidateRoot, relativePath);
		if (fs.existsSync(fullPath)) {
			fs.writeFileSync(fullPath, transformBrandDocument(fs.readFileSync(fullPath, 'utf8'), config));
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
		projectIndex.keywords = projectIndex.keywords?.map((keyword) => transformKeyword(keyword, config));
		writeJson(projectIndexPath, projectIndex, 2);
	}

	const gitignorePath = path.join(candidateRoot, '.gitignore');
	fs.writeFileSync(gitignorePath, transformGitignore(fs.readFileSync(gitignorePath, 'utf8')));
	const ciPath = path.join(candidateRoot, '.github', 'workflows', 'ci.yml');
	if (fs.existsSync(ciPath)) {
		fs.writeFileSync(ciPath, transformCiWorkflow(fs.readFileSync(ciPath, 'utf8')));
	}
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
		'nodes/MaibaoApi/MaibaoApi.node.ts',
	];
	const forbidden = /MaibaoAPI|maibaoApi|api\.maibao\.chat|n8n-nodes-maibaoapi/;
	for (const relativePath of brandSurfaces) {
		const content = fs.readFileSync(resolveManagedPath(candidateRoot, relativePath), 'utf8');
		if (forbidden.test(content)) {
			throw new Error(`Upstream brand leaked into ${relativePath}`);
		}
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
