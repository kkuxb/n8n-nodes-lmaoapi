import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const projectRoot = process.cwd();
const pushAfterSync = process.argv.includes('--push');
const helpRequested = process.argv.includes('--help') || process.argv.includes('-h');

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
		'',
		'Optional:',
		'  --push    Run git push --force-with-lease after successful validation',
	].join('\n'));
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function run(command, args, label, options = {}) {
	console.log(`\n[${label}] ${command} ${args.join(' ')}`);

	const result = spawnSync(command, args, {
		cwd: projectRoot,
		stdio: 'inherit',
		shell: isWin,
		...options,
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function capture(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: projectRoot,
		encoding: 'utf8',
		shell: isWin,
		...options,
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	return result.stdout.trim();
}

if (helpRequested) {
	printUsage();
	process.exit(0);
}

const gitDir = capture('git', ['rev-parse', '--git-dir']);
if (!gitDir) {
	fail('This script must be run inside a git repository.');
}

const upstreamUrl = capture('git', ['remote', 'get-url', 'upstream']);
if (!upstreamUrl) {
	fail('Missing git remote: upstream');
}

const statusOutput = capture('git', ['status', '--porcelain']);
if (statusOutput) {
	fail([
		'Working tree is not clean. Commit, stash, or discard changes before syncing upstream.',
		'',
		statusOutput,
	].join('\n'));
}

const currentBranch = capture('git', ['branch', '--show-current']);

console.log(`Using upstream remote: ${upstreamUrl}`);
console.log(`Current branch: ${currentBranch || '(detached HEAD)'}`);

run('git', ['fetch', 'upstream', '--tags'], 'Fetch upstream');

if (currentBranch !== 'main') {
	run('git', ['switch', 'main'], 'Switch to main');
}

run('git', ['rebase', 'upstream/master'], 'Rebase onto upstream/master');
run('npm', ['run', 'lint'], 'Lint');
run('npm', ['run', 'build'], 'Build');

if (pushAfterSync) {
	run('git', ['push', '--force-with-lease'], 'Push origin/main');
	console.log('\nUpstream sync completed and pushed successfully.');
	process.exit(0);
}

console.log('\nUpstream sync completed successfully.');
console.log('Next step: review the result and run `git push` or `git push --force-with-lease` if needed.');
