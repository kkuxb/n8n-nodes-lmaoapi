const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
	inspectAac,
	splitM4a,
	muxM4a,
	MAX_AUDIO_BYTES,
} = require('../dist/nodes/MaibaoApi/audio/M4aMedia');
const source = fs.readFileSync(path.join(__dirname, 'fixtures/audio/tone.m4a'));
const packet = (a, s) => Buffer.from(a.bytes.subarray(s.offset, s.offset + s.size));

test('AAC priming edit, tail trim and overlap preserve audible timeline and encoded packets', () => {
	const audio = inspectAac(source);
	assert.equal(audio.timescale, 48000);
	assert.equal(audio.mediaStartTicks, 1024);
	assert.equal(audio.durationSeconds, 3.3);
	const chunks = [...splitM4a(audio, 1)];
	assert.equal(chunks.length, 4);
	let end = 0;
	const originals = new Set(audio.samples.map((s) => packet(audio, s).toString('hex')));
	for (const chunk of chunks) {
		assert.equal(chunk.ownedStartSeconds, end);
		const restored = inspectAac(chunk.bytes);
		assert.ok(Math.abs(restored.durationSeconds - chunk.durationSeconds) < 1e-10);
		assert.deepEqual(restored.sampleEntry, audio.sampleEntry);
		assert.equal(restored.timelineOffsetSeconds, 0);
		assert.ok(chunk.ownedStartSeconds - chunk.startSeconds <= 0.5 + 1e-10);
		for (const s of restored.samples) assert.ok(originals.has(packet(restored, s).toString('hex')));
		end = chunk.ownedEndSeconds;
	}
	assert.equal(end, 3.3);
});

function box(type, body) {
	const b = Buffer.alloc(body.length + 8);
	b.writeUInt32BE(b.length);
	b.write(type, 4, 'ascii');
	body.copy(b, 8);
	return b;
}
const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
function rewrite(bytes, change) {
	const parts = [];
	for (let at = 0; at < bytes.length; ) {
		const size = bytes.readUInt32BE(at),
			type = bytes.toString('ascii', at + 4, at + 8);
		let body = bytes.subarray(at + 8, at + size);
		if (containers.has(type)) body = rewrite(body, change);
		parts.push(change(type, body) ?? box(type, body));
		at += size;
	}
	return Buffer.concat(parts);
}

test('co64 offsets, version 1 mdhd and a leading empty edit remain correctly mapped', () => {
	const a = inspectAac(source),
		base = Buffer.from(muxM4a(a, 0, a.samples.length));
	function transform(delta) {
		return rewrite(base, (type, body) => {
			if (type === 'stco') {
				const b = Buffer.alloc(8 + body.readUInt32BE(4) * 8);
				body.copy(b, 0, 0, 8);
				for (let i = 0; i < body.readUInt32BE(4); i++)
					b.writeBigUInt64BE(BigInt(body.readUInt32BE(8 + i * 4) + delta), 8 + i * 8);
				return box('co64', b);
			}
			if (type === 'mdhd') {
				const b = Buffer.alloc(36);
				b[0] = 1;
				b.writeUInt32BE(body.readUInt32BE(12), 20);
				b.writeBigUInt64BE(BigInt(body.readUInt32BE(16)), 24);
				body.copy(b, 32, 20);
				return box(type, b);
			}
			if (type === 'elst') {
				const b = Buffer.alloc(body.length + 12);
				body.copy(b);
				b.writeUInt32BE(2, 4);
				b.writeUInt32BE(48000, 8);
				b.writeInt32BE(-1, 12);
				b.writeUInt32BE(0x10000, 16);
				body.copy(b, 20, 8);
				return box(type, b);
			}
		});
	}
	const updated = transform(transform(0).length - base.length);
	const result = inspectAac(updated);
	assert.equal(result.timelineOffsetSeconds, 1);
	assert.equal(result.durationSeconds, 3.3);
	assert.deepEqual(
		result.samples.map((s) => packet(result, s)),
		a.samples.map((s) => packet(a, s)),
	);
	assert.equal([...splitM4a(result, 1)][0].startSeconds, 1);
});

test('packet timing overrides shorter, longer and unknown mdhd durations without changing audio', () => {
	const original = inspectAac(source);
	const totalTicks = original.samples.reduce((sum, sample) => sum + sample.duration, 0);
	for (const declared of [
		totalTicks - original.mediaStartTicks,
		totalTicks + 48000,
		0,
		0xffffffff,
	]) {
		const changed = Buffer.from(source);
		changed.writeUInt32BE(declared, changed.indexOf('mdhd') + 20);
		const result = inspectAac(changed);
		assert.equal(result.durationSeconds, original.durationSeconds);
		assert.equal(result.mediaStartTicks, original.mediaStartTicks);
		assert.deepEqual(
			result.samples.map((s) => packet(result, s)),
			original.samples.map((s) => packet(original, s)),
		);
		const chunks = [...splitM4a(result, 1)];
		assert.equal(chunks.at(-1).ownedEndSeconds, original.durationSeconds);
		assert.deepEqual(
			chunks.map((c) => c.bytes),
			[...splitM4a(original, 1)].map((c) => c.bytes),
		);
	}
});

test('unknown version 1 duration is recovered from packets without interpreting the uint64 sentinel', () => {
	const original = inspectAac(source);
	const updated = rewrite(source, (type, body) => {
		if (type === 'mdhd') {
			const b = Buffer.alloc(36);
			b[0] = 1;
			b.writeUInt32BE(body.readUInt32BE(12), 20);
			b.writeBigUInt64BE(0xffffffffffffffffn, 24);
			body.copy(b, 32, 20);
			return box(type, b);
		}
		if (type === 'stco') {
			const b = Buffer.from(body);
			for (let i = 0; i < b.readUInt32BE(4); i++)
				b.writeUInt32BE(b.readUInt32BE(8 + i * 4) + 12, 8 + i * 4);
			return box(type, b);
		}
	});
	const result = inspectAac(updated);
	assert.equal(result.durationSeconds, 3.3);
	assert.deepEqual(
		result.samples.map((s) => packet(result, s)),
		original.samples.map((s) => packet(original, s)),
	);
});

test('without edit lists the full packet timeline is used, even when mdhd would truncate the tail', () => {
	const original = inspectAac(source);
	const full = Buffer.from(
		muxM4a(
			{
				...original,
				mediaStartTicks: 0,
				durationTicks: original.samples.reduce((sum, s) => sum + s.duration, 0),
			},
			0,
			original.samples.length,
		),
	);
	assert.equal(full.indexOf('elst'), -1);
	full.writeUInt32BE(48000, full.indexOf('mdhd') + 20);
	const result = inspectAac(full);
	assert.equal(
		result.durationTicks,
		original.samples.reduce((sum, s) => sum + s.duration, 0),
	);
	assert.equal([...splitM4a(result, 1)].at(-1).ownedEndSeconds, result.durationSeconds);
});

test('tail rounding is clamped to available packets while intentional trims are preserved', () => {
	const original = inspectAac(source);
	const totalTicks = original.samples.reduce((sum, s) => sum + s.duration, 0);
	const movieScale = source.readUInt32BE(source.indexOf('mvhd') + 16);
	const changed = Buffer.from(source);
	const roundedDuration =
		Math.ceil(((totalTicks - original.mediaStartTicks) * movieScale) / original.timescale) + 1;
	changed.writeUInt32BE(roundedDuration, changed.indexOf('elst') + 12);
	const result = inspectAac(changed);
	assert.equal(result.durationTicks, totalTicks - original.mediaStartTicks);
	for (const chunk of splitM4a(result, 1))
		assert.equal(inspectAac(chunk.bytes).durationSeconds, chunk.durationSeconds);
	changed.writeUInt32BE(movieScale, changed.indexOf('elst') + 12);
	changed.writeUInt32BE(24000, changed.indexOf('elst') + 16);
	const trimmed = inspectAac(changed);
	assert.equal(trimmed.mediaStartTicks, 24000);
	assert.equal(trimmed.durationSeconds, 1);
	assert.equal([...splitM4a(trimmed, 1)].at(-1).ownedEndSeconds, 1);
});

test('timing compatibility still rejects missing packets, invalid byte ranges and unavailable edits', () => {
	const original = inspectAac(source);
	const totalTicks = original.samples.reduce((sum, s) => sum + s.duration, 0);
	for (const edit of [
		(b) => b.writeUInt32BE(0, b.indexOf('stts') + 12),
		(b) => b.writeUInt32BE(b.readUInt32BE(b.indexOf('stts') + 12) - 1, b.indexOf('stts') + 12),
		(b) => b.writeUInt32BE(0, b.indexOf('stts') + 16),
		(b) => b.writeUInt32BE(0xffffffff, b.indexOf('stts') + 16),
		(b) => b.writeUInt32BE(b.length, b.indexOf('stco') + 12),
		(b) => b.writeUInt32BE(totalTicks, b.indexOf('elst') + 16),
		(b) => b.writeUInt32BE(totalTicks + 48000, b.indexOf('elst') + 12),
	]) {
		const changed = Buffer.from(source);
		changed.writeUInt32BE(0, changed.indexOf('mdhd') + 20);
		edit(changed);
		assert.throws(() => inspectAac(changed), /stts|sample|mdat|duration|edit/i);
	}
});

test('malformed input, sample overflow, unsupported codecs and fragmented media fail before submission', () => {
	for (const data of [
		Buffer.alloc(0),
		source.subarray(0, 100),
		source.subarray(0, source.length - 1),
		Buffer.from('ID3 an mp3'),
	])
		assert.throws(() => inspectAac(data));
	const changed = Buffer.from(source),
		stsz = changed.indexOf('stsz');
	changed.writeUInt32BE(0x7fffffff, stsz + 12);
	assert.throws(() => inspectAac(changed), /sample|stsz/);
	const codec = Buffer.from(source);
	codec.write('enca', codec.indexOf('mp4a'));
	assert.throws(() => inspectAac(codec), /mp4a/);
	assert.throws(
		() => inspectAac(Buffer.concat([source, box('moof', Buffer.alloc(0))])),
		/Fragmented/,
	);
	const edit = Buffer.from(source);
	edit.writeUInt32BE(0x20000, edit.indexOf('elst') + 20);
	assert.throws(() => inspectAac(edit), /rate/);
	assert.equal(MAX_AUDIO_BYTES, 128 * 1024 * 1024);
	for (const n of [0, -1, Infinity, NaN, 0.00001])
		assert.throws(() => [...splitM4a(inspectAac(source), n)]);
});
