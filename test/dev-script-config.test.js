const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const devScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'dev.mjs'), 'utf8');

test('dev script pins n8n 2.x in the Node 24 runtime directory', () => {
	assert.match(devScript, /const pinnedN8nVersion = '2\.19\.5';/);
	assert.match(devScript, /const requiredNodeMajorVersion = 24;/);
	assert.match(devScript, /'\.n8n-dev-server-node24'/);
	assert.match(devScript, /'\.npm-n8n-cache-node24'/);
});

test('dev script no longer contains stale Node 22 guidance', () => {
	assert.doesNotMatch(devScript, /requires Node\.js 22/);
	assert.doesNotMatch(devScript, /Switch this project shell to Node 22/);
	assert.doesNotMatch(devScript, /n8n@1\.123\.15/);
});
