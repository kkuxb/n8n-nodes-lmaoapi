import fs from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
	throw new Error('Provide the release version, for example: node scripts/release-notes.mjs 1.4.0');
}

const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const sections = changelog.split(/^## /m);
const section = sections.find((entry) => entry.startsWith(`[${version}]`));
if (!section) throw new Error(`CHANGELOG.md has no entry for ${version}`);

console.log(section.slice(section.indexOf('\n')).trim());
