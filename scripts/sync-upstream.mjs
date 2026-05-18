import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const projectRoot = process.cwd();
const pushAfterSync = process.argv.includes('--push');
const allowDirty = process.argv.includes('--allow-dirty');
const helpRequested = process.argv.includes('--help') || process.argv.includes('-h');
const gitConfigArgs = ['-c', 'core.excludesFile=.gitignore'];

function printUsage() {
	console.log([
		'Usage:',
		'  npm run sync-upstream',
		'  npm run sync-upstream -- --push',
		'',
		'Default flow:',
		'  1. Ensure working tree is clean',
		'  2. git fetch upstream --tags',
		'  3. git switch main',
		'  4. git rebase upstream/master',
		'  5. npm run lint',
		'  6. npm run build',
		'  7. npm test',
		'',
		'Fallback:',
		'  If the local .git directory is not writable, the script clones upstream',
		'  into a temporary directory, imports upstream files, reapplies LmaoAPI branding,',
		'  refreshes package-lock.json, then runs lint/build/test.',
		'',
		'Optional:',
		'  --push         Run git push --force-with-lease after successful git rebase flow',
		'  --allow-dirty  Allow fallback sync to run with local modifications',
	].join('\n'));
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function displayArgs(args) {
	return args.join(' ');
}

function run(command, args, label, options = {}) {
	console.log(`\n[${label}] ${command} ${displayArgs(args)}`);

	const result = spawnSync(command, args, {
		cwd: projectRoot,
		stdio: 'inherit',
		shell: isWin,
		...options,
	});

	if (result.status !== 0 && !options.allowFailure) {
		process.exit(result.status ?? 1);
	}

	return result;
}

function capture(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: 'utf8',
		shell: isWin,
		...options,
	});

	if (result.status !== 0 && !options.allowFailure) {
		process.exit(result.status ?? 1);
	}

	return {
		status: result.status ?? 1,
		stdout: result.stdout.trim(),
		stderr: result.stderr.trim(),
	};
}

function git(args) {
	return ['git', [...gitConfigArgs, ...args]];
}

function runGit(args, label, options = {}) {
	const [command, commandArgs] = git(args);
	return run(command, commandArgs, label, options);
}

function captureGit(args, options = {}) {
	const [command, commandArgs] = git(args);
	return capture(command, commandArgs, options);
}

function normalizeRelativePath(filePath) {
	return filePath.split(path.sep).join('/');
}

function copyRecursive(sourceRoot, destinationRoot, shouldSkip) {
	for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
		const sourcePath = path.join(sourceRoot, entry.name);
		const relativePath = normalizeRelativePath(path.relative(sourceRootBase, sourcePath));
		const destinationPath = path.join(destinationRoot, relativePath);

		if (shouldSkip(relativePath)) {
			continue;
		}

		if (entry.isDirectory()) {
			fs.mkdirSync(destinationPath, { recursive: true });
			copyRecursive(sourcePath, destinationRoot, shouldSkip);
			continue;
		}

		fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
		fs.copyFileSync(sourcePath, destinationPath);
	}
}

function transformReadme(content) {
	return content
		.replaceAll('n8n-nodes-MaibaoAPI', 'n8n-nodes-LmaoAPI')
		.replaceAll('n8n-nodes-maibaoapi', 'n8n-nodes-lmaoapi')
		.replaceAll('MaibaoAPI', 'LmaoAPI')
		.replaceAll('麦包平台（https://api.maibao.chat）', '龙猫平台（https://api.lmao.net.cn）')
		.replaceAll('https://api.maibao.chat/v1', 'https://api.lmao.net.cn/v1')
		.replaceAll('Node.js `22.x`', 'Node.js `24.x`')
		.replaceAll('`.n8n-dev-server/`', '`.n8n-dev-server-node24/`')
		.replaceAll('`.npm-n8n-cache/`', '`.npm-n8n-cache-node24/`')
		.replaceAll('优先切到 Node.js 22', '优先确认当前 shell 使用 Node.js 24');
}

function transformBrandDoc(content) {
	return content
		.replaceAll('n8n-nodes-maibaoapi', 'n8n-nodes-lmaoapi')
		.replaceAll('MaibaoAPI', 'LmaoAPI')
		.replaceAll('https://api.maibao.chat', 'https://api.lmao.net.cn')
		.replaceAll('`.n8n-dev-server/`', '`.n8n-dev-server-node24/`')
		.replaceAll('`.npm-n8n-cache/`', '`.npm-n8n-cache-node24/`')
		.replaceAll('maibaoapi.png           # Node icon', 'maibaoapi.svg           # Node icon')
		.replaceAll('maibaoapi.png', 'maibaoapi.svg');
}

function transformNode(content) {
	let transformed = content
		.replace("displayName: 'MaibaoAPI'", "displayName: 'LmaoAPI'")
		.replace("name: 'maibaoApi'", "name: 'lmaoApi'")
		.replace("icon: 'file:maibaoapi.png'", "icon: 'file:maibaoapi.svg'")
		.replace('调用 MaibaoAPI 进行文字、图像、Sora 2 视频生成及向量嵌入', '调用 LmaoAPI 进行文字、图像、Sora 2 视频生成及向量嵌入')
		.replace("defaults: { name: 'MaibaoAPI' }", "defaults: { name: 'LmaoAPI' }")
		.replace("credentials: [{ name: 'maibaoApi', required: true }]", "credentials: [{ name: 'lmaoApi', required: true }]")
		.replace("this.getCredentials('maibaoApi')", "this.getCredentials('lmaoApi')");

	if (!transformed.startsWith('/* eslint-disable')) {
		transformed = [
			'/* eslint-disable @n8n/community-nodes/no-http-request-with-manual-auth, n8n-nodes-base/node-filename-against-convention */',
			transformed,
		].join('\n');
	}

	return transformed;
}

function writeBrandedCredentials() {
	const credentialsPath = path.join(projectRoot, 'credentials', 'MaibaoApi.credentials.ts');
	fs.writeFileSync(
		credentialsPath,
		[
			"import { ICredentialType, INodeProperties, ICredentialTestRequest } from 'n8n-workflow';",
			'',
			'export class MaibaoApi implements ICredentialType {',
			"\tname = 'lmaoApi';",
			"\tdisplayName = 'LmaoAPI API';",
			"\ticon = { light: 'file:maibaoapi.svg', dark: 'file:maibaoapi.svg' } as const;",
			"\tdocumentationUrl = 'https://api.lmao.net.cn';",
			'\tproperties: INodeProperties[] = [',
			'\t\t{',
			"\t\t\tdisplayName: 'API Key',",
			"\t\t\tname: 'apiKey',",
			"\t\t\ttype: 'string',",
			'\t\t\ttypeOptions: { password: true },',
			"\t\t\tdefault: '',",
			'\t\t\trequired: true,',
			'\t\t},',
			'\t\t{',
			"\t\t\tdisplayName: 'Base URL',",
			"\t\t\tname: 'baseUrl',",
			"\t\t\ttype: 'string',",
			"\t\t\tdefault: 'https://api.lmao.net.cn/v1',",
			"\t\t\tdescription: '高级覆盖项。默认使用 LmaoAPI 官方地址，仅在自定义兼容网关时修改。',",
			'\t\t},',
			'\t];',
			'\ttest: ICredentialTestRequest = {',
			'\t\trequest: {',
			'\t\t\turl: \'={{(($credentials.baseUrl || "").replace(/\\\\/+$/, "").endsWith("/v1") ? ($credentials.baseUrl || "").replace(/\\\\/+$/, "") : ($credentials.baseUrl || "").replace(/\\\\/+$/, "") + "/v1") + "/models"}}\',',
			'\t\t\theaders: {',
			"\t\t\t\tAuthorization: '=Bearer {{$credentials.apiKey}}',",
			'\t\t\t},',
			'\t\t},',
			'\t};',
			'}',
			'',
		].join('\n'),
	);
}

function syncPackageJson(upstreamRoot) {
	const upstreamPackage = JSON.parse(fs.readFileSync(path.join(upstreamRoot, 'package.json'), 'utf8'));
	const packagePath = path.join(projectRoot, 'package.json');
	const currentPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

	currentPackage.version = upstreamPackage.version;
	currentPackage.engines = { node: '24.x' };
	currentPackage.scripts = {
		...currentPackage.scripts,
		'sync-upstream': 'node scripts/sync-upstream.mjs',
		test: 'node --test test/*.test.js',
	};

	fs.writeFileSync(packagePath, `${JSON.stringify(currentPackage, null, '\t')}\n`);
}

function syncPackageLock(upstreamRoot) {
	const upstreamPackage = JSON.parse(fs.readFileSync(path.join(upstreamRoot, 'package.json'), 'utf8'));
	const packageLockPath = path.join(projectRoot, 'package-lock.json');
	const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));

	packageLock.name = 'n8n-nodes-lmaoapi';
	packageLock.version = upstreamPackage.version;
	packageLock.packages[''] = {
		...packageLock.packages[''],
		name: 'n8n-nodes-lmaoapi',
		version: upstreamPackage.version,
		engines: { node: '24.x' },
		devDependencies: {
			'@n8n/node-cli': '^0.23.1',
			'@types/node': '^25.0.3',
			eslint: '9.32.0',
			prettier: '3.6.2',
			'release-it': '^19.0.4',
			typescript: '5.9.2',
		},
		peerDependencies: {
			'n8n-workflow': '^2.13.1',
		},
	};

	fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, '\t')}\n`);
}

let sourceRootBase = '';

function cloneUpstream(upstreamUrl) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		const tempRoot = path.join(projectRoot, `.tmp-upstream-sync-${process.pid}-${Date.now()}-${attempt}`);
		const result = run(
			'git',
			[...gitConfigArgs, 'clone', '--depth', '1', '--branch', 'master', upstreamUrl, tempRoot],
			`Clone upstream fallback (${attempt}/3)`,
			{ allowFailure: true },
		);

		if (result.status === 0) {
			return tempRoot;
		}

		fs.rmSync(tempRoot, { recursive: true, force: true });
	}

	fail('Failed to clone upstream after 3 attempts.');
}

function fallbackSync(upstreamUrl) {
	if (pushAfterSync) {
		fail('Cannot use --push when fallback sync is required because the local .git directory is not writable.');
	}

	const tempRoot = cloneUpstream(upstreamUrl);

	sourceRootBase = tempRoot;
	const skippedPaths = new Set([
		'.git',
		'.gitignore',
		'.nvmrc',
		'README.md',
		'UPSTREAM_SYNC.md',
		'package.json',
		'package-lock.json',
		'scripts/sync-upstream.mjs',
		'credentials/MaibaoApi.credentials.ts',
		'credentials/maibaoapi.png',
		'credentials/maibaoapi.svg',
		'nodes/MaibaoApi/MaibaoApi.node.ts',
		'nodes/MaibaoApi/maibaoapi.png',
		'nodes/MaibaoApi/maibaoapi.svg',
	]);

	copyRecursive(tempRoot, projectRoot, (relativePath) => {
		return relativePath === '.git' || relativePath.startsWith('.git/') || skippedPaths.has(relativePath);
	});

	const upstreamNodePath = path.join(tempRoot, 'nodes', 'MaibaoApi', 'MaibaoApi.node.ts');
	fs.writeFileSync(
		path.join(projectRoot, 'nodes', 'MaibaoApi', 'MaibaoApi.node.ts'),
		transformNode(fs.readFileSync(upstreamNodePath, 'utf8')),
	);
	fs.writeFileSync(
		path.join(projectRoot, 'README.md'),
		transformReadme(fs.readFileSync(path.join(tempRoot, 'README.md'), 'utf8')),
	);
	const upstreamPackage = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));
	for (const docPath of ['CHANGELOG.md', 'CLAUDE.md', 'PROJECT_INDEX.md']) {
		const fullPath = path.join(projectRoot, docPath);
		if (fs.existsSync(fullPath)) {
			let docContent = transformBrandDoc(fs.readFileSync(fullPath, 'utf8'));
			if (docPath === 'PROJECT_INDEX.md') {
				docContent = docContent
					.replace(/\*\*Version:\*\* .+/, `**Version:** ${upstreamPackage.version}`)
					.replace(/- \*\*Version:\*\* .+/, `- **Version:** ${upstreamPackage.version}`);
			}
			fs.writeFileSync(fullPath, docContent);
		}
	}
	const projectIndexJsonPath = path.join(projectRoot, 'PROJECT_INDEX.json');
	if (fs.existsSync(projectIndexJsonPath)) {
		const projectIndex = JSON.parse(transformBrandDoc(fs.readFileSync(projectIndexJsonPath, 'utf8')));
		projectIndex.version = upstreamPackage.version;
		projectIndex.keywords = projectIndex.keywords?.map((keyword) => {
			if (keyword === 'maibaoapi') return 'lmaoapi';
			if (keyword === 'maibao') return 'lmao';
			return keyword;
		});
		fs.writeFileSync(projectIndexJsonPath, `${JSON.stringify(projectIndex, null, 2)}\n`);
	}
	writeBrandedCredentials();
	syncPackageJson(tempRoot);
	syncPackageLock(tempRoot);

	fs.writeFileSync(path.join(projectRoot, '.nvmrc'), '24\n');
	fs.rmSync(tempRoot, { recursive: true, force: true });

	run('npm', ['run', 'lint'], 'Lint');
	run('npm', ['run', 'build'], 'Build');
	run('npm', ['test'], 'Test');

	console.log('\nFallback upstream sync completed successfully.');
	console.log('Local .git permissions still need to be fixed before pushing from this checkout.');
}

if (helpRequested) {
	printUsage();
	process.exit(0);
}

const gitDir = captureGit(['rev-parse', '--git-dir']).stdout;
if (!gitDir) {
	fail('This script must be run inside a git repository.');
}

const upstreamUrl = captureGit(['remote', 'get-url', 'upstream']).stdout;
if (!upstreamUrl) {
	fail('Missing git remote: upstream');
}

const statusOutput = captureGit(['status', '--porcelain']).stdout;
if (statusOutput && !allowDirty) {
	fail([
		'Working tree is not clean. Commit, stash, or discard changes before syncing upstream.',
		'Use --allow-dirty only for fallback recovery in a controlled working tree.',
		'',
		statusOutput,
	].join('\n'));
}

const currentBranch = captureGit(['branch', '--show-current']).stdout;

console.log(`Using upstream remote: ${upstreamUrl}`);
console.log(`Current branch: ${currentBranch || '(detached HEAD)'}`);

const fetchResult = runGit(['fetch', 'upstream', '--tags'], 'Fetch upstream', { allowFailure: true });
if (fetchResult.status !== 0) {
	console.warn('\nFetch failed. Falling back to clone-based upstream import.');
	fallbackSync(upstreamUrl);
	process.exit(0);
}

if (currentBranch !== 'main') {
	runGit(['switch', 'main'], 'Switch to main');
}

runGit(['rebase', 'upstream/master'], 'Rebase onto upstream/master');
run('npm', ['run', 'lint'], 'Lint');
run('npm', ['run', 'build'], 'Build');
run('npm', ['test'], 'Test');

if (pushAfterSync) {
	runGit(['push', '--force-with-lease'], 'Push origin/main');
	console.log('\nUpstream sync completed and pushed successfully.');
	process.exit(0);
}

console.log('\nUpstream sync completed successfully.');
console.log('Next step: review the result and run `git push` or `git push --force-with-lease` if needed.');
