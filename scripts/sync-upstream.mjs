import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
	applyManagedSnapshot,
	assertCandidateBranding,
	compareManagedSnapshot,
	loadBrandConfig,
	prepareCandidate,
	readSyncState,
} from './upstream-sync-lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDirectory);
const checkOnly = process.argv.includes('--check');
const allowDirty = process.argv.includes('--allow-dirty');
const helpRequested = process.argv.includes('--help') || process.argv.includes('-h');

function printUsage() {
	console.log(
		[
			'Usage:',
			'  npm run sync-upstream -- --check',
			'  npm run sync-upstream',
			'',
			'Flow:',
			'  1. Clone the configured upstream/master snapshot into a temporary directory',
			'  2. Apply the declarative LmaoAPI brand contract',
			'  3. Validate version, package metadata, logo, node name, credential, and API URL invariants',
			'  4. Run npm ci, lint, build, and tests against the complete candidate',
			'  5. Copy the validated managed snapshot into this repository and remove upstream-deleted files',
			'',
			'Options:',
			'  --check        Build and validate the candidate without changing this repository',
			'  --allow-dirty  Permit a controlled run with local changes (review carefully)',
			'  --help, -h     Show this help',
			'',
			'Environment overrides:',
			'  UPSTREAM_URL       Override the configured upstream Git URL',
			'  UPSTREAM_BRANCH    Override the configured upstream branch',
		].join('\n'),
	);
}

function resolveInvocation(command, args) {
	if (process.platform !== 'win32' || command !== 'npm') {
		return { command, args };
	}
	const npmCli =
		process.env.npm_execpath ??
		path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
	if (!fs.existsSync(npmCli)) {
		throw new Error(`Cannot locate npm CLI for Windows: ${npmCli}`);
	}
	return { command: process.execPath, args: [npmCli, ...args] };
}

function displayCommand(command, args) {
	return [command, ...args].join(' ');
}

function run(command, args, { cwd = projectRoot, label, capture = false } = {}) {
	if (label) console.log(`\n[${label}] ${displayCommand(command, args)}`);
	const invocation = resolveInvocation(command, args);
	const result = spawnSync(invocation.command, invocation.args, {
		cwd,
		encoding: capture ? 'utf8' : undefined,
		stdio: capture ? 'pipe' : 'inherit',
		shell: false,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const details = capture ? (result.stderr || result.stdout || '').trim() : '';
		throw new Error(
			`${label ?? command} failed with exit code ${result.status}${details ? `:\n${details}` : ''}`,
		);
	}
	return capture ? (result.stdout ?? '').trim() : '';
}

function cloneConfig(value) {
	return JSON.parse(JSON.stringify(value));
}

function loadEffectiveConfig() {
	const config = cloneConfig(loadBrandConfig(path.join(scriptDirectory, 'upstream-brand.json')));
	if (process.env.UPSTREAM_URL) config.upstream.url = process.env.UPSTREAM_URL;
	if (process.env.UPSTREAM_BRANCH) config.upstream.branch = process.env.UPSTREAM_BRANCH;
	return config;
}

function ensureUsableWorktree() {
	run('git', ['rev-parse', '--show-toplevel'], { label: 'Check repository', capture: true });
	const status = run('git', ['status', '--porcelain', '--untracked-files=all'], {
		label: 'Check working tree',
		capture: true,
	});
	if (status && !allowDirty) {
		throw new Error(
			[
				'Working tree is not clean. Commit or stash changes before syncing.',
				'Use --allow-dirty only for a controlled check or repair run.',
				'',
				status,
			].join('\n'),
		);
	}
	if (status && allowDirty) {
		console.warn('\nWarning: continuing with local changes because --allow-dirty was supplied.');
	}
}

function validateCandidate(candidateRoot, config, version) {
	assertCandidateBranding(candidateRoot, config, version);
	run('npm', ['ci'], { cwd: candidateRoot, label: 'Install candidate dependencies' });
	run('npm', ['run', 'lint'], { cwd: candidateRoot, label: 'Lint candidate' });
	run('npm', ['run', 'build'], { cwd: candidateRoot, label: 'Build candidate' });
	run('npm', ['test'], { cwd: candidateRoot, label: 'Test candidate' });
	assertCandidateBranding(candidateRoot, config, version);
}

function printChangedPaths(changedPaths) {
	if (changedPaths.length === 0) {
		console.log('\nCandidate matches the current managed snapshot; no file changes are required.');
		return;
	}
	console.log(`\nValidated candidate changes ${changedPaths.length} managed file(s):`);
	for (const relativePath of changedPaths) console.log(`  ${relativePath}`);
}

async function main() {
	if (helpRequested) {
		printUsage();
		return;
	}

	ensureUsableWorktree();
	const config = loadEffectiveConfig();
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lmao-upstream-sync-'));
	const candidateRoot = path.join(tempRoot, 'upstream');

	try {
		console.log(`\nUpstream: ${config.upstream.url}#${config.upstream.branch}`);
		run(
			'git',
			[
				'-c',
				'core.excludesFile=.gitignore',
				'clone',
				'--depth',
				'1',
				'--branch',
				config.upstream.branch,
				config.upstream.url,
				candidateRoot,
			],
			{ label: 'Clone upstream snapshot' },
		);
		const upstreamCommit = run('git', ['rev-parse', 'HEAD'], {
			cwd: candidateRoot,
			label: 'Read upstream commit',
			capture: true,
		});
		const upstreamPackage = JSON.parse(
			fs.readFileSync(path.join(candidateRoot, 'package.json'), 'utf8'),
		);
		const state = prepareCandidate({ projectRoot, candidateRoot, config, upstreamCommit });
		validateCandidate(candidateRoot, config, upstreamPackage.version);

		const previousState = readSyncState(projectRoot);
		const previousManagedPaths = previousState?.managedPaths ?? config.retiredPaths;
		const changedPaths = compareManagedSnapshot({
			sourceRoot: candidateRoot,
			destinationRoot: projectRoot,
			previousManagedPaths,
			nextManagedPaths: state.managedPaths,
		});
		printChangedPaths(changedPaths);

		if (checkOnly) {
			console.log(
				`\nCheck completed successfully at upstream ${upstreamPackage.version} (${upstreamCommit.slice(0, 12)}).`,
			);
			return;
		}

		applyManagedSnapshot({
			sourceRoot: candidateRoot,
			destinationRoot: projectRoot,
			previousManagedPaths,
			nextManagedPaths: state.managedPaths,
		});
		console.log(
			`\nUpstream ${upstreamPackage.version} (${upstreamCommit.slice(0, 12)}) was synchronized successfully.`,
		);
		console.log('Review the working-tree diff, then commit and push it normally.');
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(`\nUpstream sync failed: ${error.message}`);
	process.exitCode = 1;
});
