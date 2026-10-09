import { AudioChunk } from './AudioTypes';
interface Box {
	type: string;
	start: number;
	end: number;
	payload: number;
}
interface Sample {
	size: number;
	duration: number;
	offset: number;
	start: number;
}
export interface AacMedia {
	bytes: Uint8Array;
	timescale: number;
	durationTicks: number;
	durationSeconds: number;
	mediaStartTicks: number;
	timelineOffsetSeconds: number;
	sampleEntry: Uint8Array;
	samples: Sample[];
}
// In-memory ISO BMFF/AAC remuxing, without files, processes or codecs.
export const MAX_AUDIO_BYTES = 128 * 1024 * 1024;
const MAX_BYTES = MAX_AUDIO_BYTES;
const MAX_SAMPLES = 500000;

function requireValue(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function view(bytes: Uint8Array) {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u32(bytes: Uint8Array, offset: number) {
	requireValue(offset >= 0 && offset + 4 <= bytes.length, 'Truncated MP4 integer');
	return view(bytes).getUint32(offset);
}

function u64(bytes: Uint8Array, offset: number) {
	requireValue(offset >= 0 && offset + 8 <= bytes.length, 'Truncated MP4 integer');
	const value = u32(bytes, offset) * 0x100000000 + u32(bytes, offset + 4);
	requireValue(Number.isSafeInteger(value), 'MP4 integer exceeds safe range');
	return value;
}

function typeAt(bytes: Uint8Array, offset: number) {
	return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function boxes(bytes: Uint8Array, start = 0, end = bytes.length): Box[] {
	const result = [];
	let offset = start;
	while (offset < end) {
		requireValue(offset + 8 <= end, 'Truncated MP4 box header');
		let size = u32(bytes, offset),
			header = 8;
		const type = typeAt(bytes, offset + 4);
		if (size === 1) {
			requireValue(offset + 16 <= end, 'Truncated extended MP4 box');
			size = u64(bytes, offset + 8);
			header = 16;
		} else if (size === 0) size = end - offset;
		requireValue(size >= header && size <= end - offset, `Invalid ${type} box size`);
		result.push({ type, start: offset, end: offset + size, payload: offset + header });
		requireValue(result.length <= 100000, 'Too many MP4 boxes');
		offset += size;
	}
	return result;
}

function only(items: Box[], type: string, required?: true): Box;
function only(items: Box[], type: string, required: false): Box | undefined;
function only(items: Box[], type: string, required = true): Box | undefined {
	const found = items.filter((item) => item.type === type);
	requireValue(
		found.length <= 1 && (!required || found.length === 1),
		`Missing or duplicate ${type} box`,
	);
	return found[0];
}

function children(bytes: Uint8Array, parent: Box) {
	return boxes(bytes, parent.payload, parent.end);
}
function payload(bytes: Uint8Array, box: Box) {
	return bytes.subarray(box.payload, box.end);
}

function descriptor(bytes: Uint8Array, start: number) {
	requireValue(start < bytes.length, 'Truncated MPEG-4 descriptor');
	const tag = bytes[start++];
	let size = 0,
		ended = false;
	for (let i = 0; i < 4; i++) {
		requireValue(start < bytes.length, 'Truncated MPEG-4 descriptor length');
		const value = bytes[start++];
		size = size * 128 + (value & 0x7f);
		if (!(value & 0x80)) {
			ended = true;
			break;
		}
	}
	requireValue(ended && size <= bytes.length - start, 'Invalid MPEG-4 descriptor length');
	return { tag, data: bytes.subarray(start, start + size), end: start + size };
}

function verifyAacConfig(entry: Uint8Array, esdsBox: Box) {
	const esds = payload(entry, esdsBox);
	requireValue(u32(esds, 0) === 0, 'Unsupported esds flags');
	const es = descriptor(esds, 4);
	requireValue(es.tag === 3 && es.data.length >= 3, 'Missing ES descriptor');
	const flags = es.data[2];
	let offset = 3;
	if (flags & 0x80) offset += 2;
	if (flags & 0x40) {
		requireValue(offset < es.data.length, 'Invalid ES URL descriptor');
		offset += 1 + es.data[offset];
	}
	if (flags & 0x20) offset += 2;
	const decoder = descriptor(es.data, offset);
	requireValue(
		decoder.tag === 4 &&
			decoder.data.length >= 13 &&
			decoder.data[0] === 0x40 &&
			decoder.data[1] >> 2 === 5,
		'Only MPEG-4 AAC audio decoder configuration is supported',
	);
	const config = descriptor(decoder.data, 13);
	requireValue(
		config.tag === 5 && config.data.length >= 2 && [2, 5, 29].includes(config.data[0] >> 3),
		'Only AAC-LC/HE-AAC AudioSpecificConfig is supported',
	);
}

function table(bytes: Uint8Array, box: Box, width: number, extra = 0) {
	const data = payload(bytes, box);
	requireValue(
		data.length >= 8 + extra && u32(data, 0) === 0,
		`Unsupported ${box.type} version/flags`,
	);
	const count = u32(data, 4 + extra);
	requireValue(
		count <= MAX_SAMPLES && data.length === 8 + extra + count * width,
		`Invalid ${box.type} sample table`,
	);
	return { data, count, start: 8 + extra };
}

export function inspectAac(bytes: Uint8Array): AacMedia {
	requireValue(
		bytes instanceof Uint8Array && bytes.length >= 8 && bytes.length <= MAX_BYTES,
		'MP4 input size must be 8 bytes to 128 MiB',
	);
	const top = boxes(bytes);
	requireValue(!top.some((b) => b.type === 'moof'), 'Fragmented MP4 is not supported');
	const movie = children(bytes, only(top, 'moov'));
	requireValue(!movie.some((b) => b.type === 'mvex'), 'Fragmented MP4 is not supported');
	const mediaData = top.filter((b) => b.type === 'mdat');
	requireValue(mediaData.length > 0, 'Missing mdat');
	const tracks = movie
		.filter((b) => b.type === 'trak')
		.map((track) => {
			const trackChildren = children(bytes, track);
			const media = children(bytes, only(trackChildren, 'mdia'));
			const handler = payload(bytes, only(media, 'hdlr'));
			requireValue(handler.length >= 12, 'Invalid hdlr');
			return { trackChildren, media, handler: typeAt(handler, 8) };
		})
		.filter((track) => track.handler === 'soun');
	requireValue(tracks.length === 1, 'Exactly one audio track is required');
	const { trackChildren, media } = tracks[0];
	const mdhd = payload(bytes, only(media, 'mdhd'));
	requireValue(mdhd[0] === 0 || mdhd[0] === 1, 'Unsupported mdhd version');
	const timescale = u32(mdhd, mdhd[0] === 1 ? 20 : 12);
	const mediaDurationTicks = mdhd[0] === 1 ? u64(mdhd, 24) : u32(mdhd, 16);
	requireValue(
		timescale > 0 && mediaDurationTicks > 0 && mediaDurationTicks < 0x100000000,
		'Unsupported audio timescale/duration',
	);
	let durationTicks = mediaDurationTicks,
		mediaStartTicks = 0,
		timelineOffsetSeconds = 0;
	const edits = only(trackChildren, 'edts', false);
	if (edits) {
		const elst = payload(bytes, only(children(bytes, edits), 'elst'));
		const mvhd = payload(bytes, only(movie, 'mvhd'));
		requireValue(mvhd[0] === 0 || mvhd[0] === 1, 'Unsupported mvhd');
		const movieScale = u32(mvhd, mvhd[0] === 1 ? 20 : 12);
		requireValue(movieScale > 0 && (elst[0] === 0 || elst[0] === 1), 'Invalid audio edit list');
		const n = u32(elst, 4),
			width = elst[0] === 1 ? 20 : 12;
		requireValue(
			(n === 1 || n === 2) && elst.length === 8 + n * width,
			'Multiple audio edits are unsupported',
		);
		for (let i = 0; i < n; i++) {
			const at = 8 + i * width;
			const segmentDuration = elst[0] === 1 ? u64(elst, at) : u32(elst, at);
			const mediaAt = at + (elst[0] === 1 ? 8 : 4);
			const empty =
				u32(elst, mediaAt) === 0xffffffff &&
				(elst[0] === 0 || u32(elst, mediaAt + 4) === 0xffffffff);
			requireValue(u32(elst, at + width - 4) === 0x10000, 'Audio edit playback rate must be 1');
			if (empty) {
				requireValue(i === 0 && n === 2, 'Only a leading empty audio edit is supported');
				timelineOffsetSeconds = segmentDuration / movieScale;
			} else {
				requireValue(i === n - 1, 'Multiple audio edits are unsupported');
				mediaStartTicks = elst[0] === 1 ? u64(elst, mediaAt) : u32(elst, mediaAt);
				const requested = Math.round((segmentDuration * timescale) / movieScale);
				requireValue(
					mediaStartTicks < mediaDurationTicks &&
						requested > 0 &&
						requested <= mediaDurationTicks - mediaStartTicks + Math.ceil(timescale / movieScale),
					'Audio edit exceeds media duration',
				);
				durationTicks = Math.min(requested, mediaDurationTicks - mediaStartTicks);
			}
		}
	}
	const minf = children(bytes, only(media, 'minf'));
	const stbl = children(bytes, only(minf, 'stbl'));
	const stsd = payload(bytes, only(stbl, 'stsd'));
	requireValue(
		u32(stsd, 0) === 0 && u32(stsd, 4) === 1,
		'Exactly one audio sample description is required',
	);
	const descriptions = boxes(stsd, 8);
	requireValue(
		descriptions.length === 1 && descriptions[0].type === 'mp4a',
		'Only unencrypted mp4a AAC is supported',
	);
	const sampleEntry = new Uint8Array(stsd.subarray(8));
	requireValue(
		sampleEntry.length >= 36 &&
			view(sampleEntry).getUint16(14) === 1 &&
			view(sampleEntry).getUint16(16) === 0,
		'Unsupported audio sample entry version/reference',
	);
	const extensions = boxes(sampleEntry, 36);
	const esdsBox = only(extensions, 'esds', false);
	requireValue(
		!!esdsBox && !extensions.some((b) => b.type === 'sinf'),
		'AAC esds required; encrypted samples are unsupported',
	);
	verifyAacConfig(sampleEntry, esdsBox);
	requireValue(
		!stbl.some((b) => ['senc', 'saiz', 'saio', 'stz2'].includes(b.type)),
		'Unsupported protected/compact sample table',
	);
	const stsz = payload(bytes, only(stbl, 'stsz'));
	requireValue(u32(stsz, 0) === 0, 'Unsupported stsz flags');
	const fixedSize = u32(stsz, 4),
		count = u32(stsz, 8);
	requireValue(
		count > 0 && count <= MAX_SAMPLES && stsz.length === 12 + (fixedSize ? 0 : 4 * count),
		'Invalid stsz sample count',
	);
	const samples = Array.from({ length: count }, (_, i) => ({
		size: fixedSize || u32(stsz, 12 + i * 4),
		duration: 0,
		offset: 0,
		start: 0,
	}));
	const stts = table(bytes, only(stbl, 'stts'), 8);
	let cursor = 0,
		totalTicks = 0;
	for (let i = 0; i < stts.count; i++) {
		const n = u32(stts.data, 8 + i * 8),
			delta = u32(stts.data, 12 + i * 8);
		requireValue(n > 0 && delta > 0 && n <= count - cursor, 'Invalid stts sample run');
		for (let j = 0; j < n; j++) {
			samples[cursor].start = totalTicks;
			samples[cursor++].duration = delta;
			totalTicks += delta;
		}
	}
	requireValue(
		cursor === count && totalTicks === mediaDurationTicks,
		'stts/mdhd sample duration mismatch',
	);
	const cttsBox = only(stbl, 'ctts', false);
	if (cttsBox) {
		const ctts = table(bytes, cttsBox, 8);
		let n = 0;
		for (let i = 0; i < ctts.count; i++) {
			n += u32(ctts.data, 8 + i * 8);
			requireValue(
				u32(ctts.data, 12 + i * 8) === 0,
				'Nonzero AAC composition offset is unsupported',
			);
		}
		requireValue(n === count, 'Invalid ctts sample count');
	}
	const stssBox = only(stbl, 'stss', false);
	if (stssBox) {
		const stss = table(bytes, stssBox, 4);
		requireValue(stss.count === count, 'Non-sync AAC samples are unsupported');
		for (let i = 0; i < count; i++)
			requireValue(u32(stss.data, 8 + i * 4) === i + 1, 'Invalid stss');
	}
	const stco = only(stbl, 'stco', false),
		co64 = only(stbl, 'co64', false);
	requireValue(Boolean(stco) !== Boolean(co64), 'Exactly one chunk offset table required');
	const offsetBox = stco || co64;
	requireValue(offsetBox, 'Missing chunk offset table');
	const offsets = table(bytes, offsetBox, stco ? 4 : 8);
	const stsc = table(bytes, only(stbl, 'stsc'), 12);
	requireValue(
		offsets.count > 0 && stsc.count > 0 && u32(stsc.data, 8) === 1,
		'Invalid stsc first chunk',
	);
	const runs = [];
	for (let i = 0; i < stsc.count; i++) {
		const first = u32(stsc.data, 8 + i * 12),
			n = u32(stsc.data, 12 + i * 12),
			description = u32(stsc.data, 16 + i * 12);
		requireValue(
			n > 0 &&
				first <= offsets.count &&
				description === 1 &&
				(i === 0 || first > runs[i - 1].first),
			'Invalid stsc sample mapping',
		);
		runs.push({ first, count: n });
	}
	cursor = 0;
	let runIndex = 0;
	for (let chunk = 1; chunk <= offsets.count; chunk++) {
		if (runIndex + 1 < runs.length && runs[runIndex + 1].first === chunk) runIndex++;
		let offset = stco
			? u32(offsets.data, 8 + (chunk - 1) * 4)
			: u64(offsets.data, 8 + (chunk - 1) * 8);
		const n = runs[runIndex].count;
		requireValue(n <= count - cursor, 'stsc exceeds sample count');
		for (let j = 0; j < n; j++) {
			const sample = samples[cursor++];
			let low = 0,
				high = mediaData.length;
			while (low < high) {
				const mid = Math.floor((low + high) / 2);
				if (mediaData[mid].payload <= offset) low = mid + 1;
				else high = mid;
			}
			const dataBox = mediaData[low - 1];
			requireValue(
				sample.size > 0 && dataBox && sample.size <= dataBox.end - offset,
				'AAC sample outside mdat',
			);
			sample.offset = offset;
			offset += sample.size;
		}
	}
	requireValue(cursor === count, 'Unmapped AAC samples');
	const sorted = samples.slice().sort((a, b) => a.offset - b.offset);
	for (let i = 1; i < sorted.length; i++)
		requireValue(
			sorted[i].offset >= sorted[i - 1].offset + sorted[i - 1].size,
			'Overlapping AAC sample bytes',
		);
	return {
		bytes,
		timescale,
		durationTicks,
		mediaStartTicks,
		timelineOffsetSeconds,
		durationSeconds: durationTicks / timescale,
		sampleEntry,
		samples,
	};
}

function join(parts: Uint8Array[]) {
	const length = parts.reduce((sum, part) => sum + part.length, 0);
	requireValue(length <= MAX_BYTES, 'Output exceeds 128 MiB limit');
	const result = new Uint8Array(length);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.length;
	}
	return result;
}
function ascii(text: string) {
	return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
function ints(...values: number[]) {
	const bytes = new Uint8Array(values.length * 4);
	values.forEach((value, i) => {
		requireValue(
			Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
			'MP4 uint32 overflow',
		);
		view(bytes).setUint32(i * 4, value);
	});
	return bytes;
}
function box(type: string, ...parts: Uint8Array[]) {
	const body = join(parts);
	return join([ints(body.length + 8), ascii(type), body]);
}
function full(type: string, flags: number, ...parts: Uint8Array[]) {
	return box(type, ints(flags), ...parts);
}
const matrix = () => ints(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

export function muxM4a(
	audio: AacMedia,
	start: number,
	end: number,
	visibleStart?: number,
	visibleEnd?: number,
) {
	requireValue(
		Number.isInteger(start) &&
			Number.isInteger(end) &&
			start >= 0 &&
			start < end &&
			end <= audio.samples.length,
		'Invalid AAC sample range',
	);
	const selected = audio.samples.slice(start, end);
	const decodedDuration = selected.reduce((sum, s) => sum + s.duration, 0);
	const from = visibleStart ?? Math.max(audio.mediaStartTicks, selected[0].start);
	const to =
		visibleEnd ??
		Math.min(audio.mediaStartTicks + audio.durationTicks, selected[0].start + decodedDuration);
	const trim = from - selected[0].start;
	const duration = to - from;
	requireValue(
		trim >= 0 && duration > 0 && trim + duration <= decodedDuration,
		'Invalid audio presentation range',
	);
	const sizes = selected.map((s) => s.size);
	const timeRuns: { count: number; delta: number }[] = [];
	for (const sample of selected) {
		const last = timeRuns[timeRuns.length - 1];
		if (last && last.delta === sample.duration) last.count++;
		else timeRuns.push({ count: 1, delta: sample.duration });
	}
	const timingTable = new Uint8Array(timeRuns.length * 8);
	const timingView = view(timingTable);
	timeRuns.forEach((run, i) => {
		timingView.setUint32(i * 8, run.count);
		timingView.setUint32(i * 8 + 4, run.delta);
	});
	const ftyp = box('ftyp', ascii('M4A '), ints(0), ascii('M4A isommp42'));
	const makeMovie = (chunkOffset: number) => {
		const mvhd = full(
			'mvhd',
			0,
			ints(0, 0, audio.timescale, duration, 0x10000, 0x01000000, 0, 0),
			matrix(),
			new Uint8Array(24),
			ints(2),
		);
		const tkhd = full(
			'tkhd',
			7,
			ints(0, 0, 1, 0, duration, 0, 0, 0, 0x01000000),
			matrix(),
			ints(0, 0),
		);
		const mdhd = full('mdhd', 0, ints(0, 0, audio.timescale, decodedDuration, 0x55c40000));
		const hdlr = full('hdlr', 0, ints(0), ascii('soun'), ints(0, 0, 0), ascii('AAC audio\0'));
		const stsd = full('stsd', 0, ints(1), audio.sampleEntry);
		const stts = full('stts', 0, ints(timeRuns.length), timingTable);
		const stsc = full('stsc', 0, ints(1, 1, selected.length, 1));
		const sizeTable = new Uint8Array(sizes.length * 4);
		sizes.forEach((size, i) => view(sizeTable).setUint32(i * 4, size));
		const stsz = full('stsz', 0, ints(0, selected.length), sizeTable);
		const stco = full('stco', 0, ints(1, chunkOffset));
		const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
		const dinf = box('dinf', full('dref', 0, ints(1), full('url ', 1)));
		const minf = box('minf', full('smhd', 0, ints(0)), dinf, stbl);
		const mdia = box('mdia', mdhd, hdlr, minf);
		const edit =
			trim || duration !== decodedDuration
				? [box('edts', full('elst', 0, ints(1, duration, trim, 0x10000)))]
				: [];
		return box('moov', mvhd, box('trak', tkhd, ...edit, mdia));
	};
	const initialMovie = makeMovie(0);
	const movie = makeMovie(ftyp.length + initialMovie.length + 8);
	// Copy AAC packets exactly, with no decoding or re-encoding.
	const data = join(selected.map((s) => audio.bytes.subarray(s.offset, s.offset + s.size)));
	return join([ftyp, movie, box('mdat', data)]);
}

export function* splitM4a(
	audio: AacMedia,
	targetSeconds = 30,
	overlapSeconds = 0.5,
): Generator<AudioChunk> {
	requireValue(
		Number.isFinite(targetSeconds) && targetSeconds > 0 && targetSeconds <= 600,
		'Chunk duration must be >0 and <=600 seconds',
	);
	requireValue(
		Number.isFinite(overlapSeconds) && overlapSeconds >= 0 && overlapSeconds < targetSeconds,
		'Invalid audio overlap',
	);
	const targetTicks = Math.floor(targetSeconds * audio.timescale);
	requireValue(
		audio.samples.every((s) => s.duration <= targetTicks),
		'Chunk duration is shorter than an AAC frame',
	);
	const mediaEnd = audio.mediaStartTicks + audio.durationTicks;
	let ownedStart = audio.mediaStartTicks,
		index = 0,
		scan = 0;
	while (ownedStart < mediaEnd) {
		const limit = Math.min(mediaEnd, ownedStart + targetTicks);
		while (
			scan < audio.samples.length &&
			audio.samples[scan].start + audio.samples[scan].duration <= limit
		)
			scan++;
		const ownedEnd =
			limit === mediaEnd
				? mediaEnd
				: audio.samples[scan - 1].start + audio.samples[scan - 1].duration;
		requireValue(ownedEnd > ownedStart, 'Audio chunk has no presentation samples');
		const from = Math.max(
			audio.mediaStartTicks,
			ownedStart - Math.floor(overlapSeconds * audio.timescale),
		);
		// Locate packets by decode time; include one preroll frame and hide it with an edit list.
		let low = 0,
			high = audio.samples.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (audio.samples[mid].start + audio.samples[mid].duration <= from) low = mid + 1;
			else high = mid;
		}
		const first = Math.max(0, low - 1);
		let last = Math.max(first + 1, scan);
		while (last < audio.samples.length && audio.samples[last].start < ownedEnd) last++;
		const global = (tick: number) =>
			audio.timelineOffsetSeconds + (tick - audio.mediaStartTicks) / audio.timescale;
		yield {
			index: index++,
			bytes: muxM4a(audio, first, last, from, ownedEnd),
			startSeconds: global(from),
			durationSeconds: (ownedEnd - from) / audio.timescale,
			ownedStartSeconds: global(ownedStart),
			ownedEndSeconds: global(ownedEnd),
		};
		ownedStart = ownedEnd;
	}
}

export function prepareAudioChunks(bytes: Uint8Array): Iterable<AudioChunk> {
	return splitM4a(inspectAac(bytes));
}
