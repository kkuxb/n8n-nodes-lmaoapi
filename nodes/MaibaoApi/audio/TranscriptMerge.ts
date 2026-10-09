import { AudioChunk, TranscriptSegment } from './AudioTypes';

export interface ChunkTranscript {
	chunk: Omit<AudioChunk, 'bytes'>;
	segments: TranscriptSegment[];
}

function normalized(text: string): string {
	return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function words(text: string) {
	return [...text.matchAll(/\p{Script=Han}|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(
		(match) => ({
			value: match[0].toLowerCase(),
			index: match.index!,
			end: match.index! + match[0].length,
		}),
	);
}

// Join only a matching suffix/prefix in the actual shared audio window.
// Keep the outer timestamps; there is no word alignment to invent a new cut time.
function joinBoundary(previous: TranscriptSegment, next: TranscriptSegment): boolean {
	const left = words(previous.text),
		right = words(next.text);
	for (let count = Math.min(left.length, right.length, 12); count >= 2; count--) {
		const suffix = left.slice(-count),
			prefix = right.slice(0, count);
		const han = prefix.every((token) => /^\p{Script=Han}$/u.test(token.value));
		if (han ? count < 4 : prefix.reduce((sum, token) => sum + token.value.length, 0) < 6) continue;
		if (!suffix.every((token, i) => token.value === prefix[i].value)) continue;
		const tail = next.text.slice(prefix[count - 1].end).trimStart();
		if (tail) {
			const punctuation = /^[,.!?;:，。！？；：]/u.test(tail);
			if (punctuation) previous.text = previous.text.replace(/[,.!?;:，。！？；：]+$/u, '');
			previous.text += (han || punctuation ? '' : ' ') + tail;
		}
		previous.start = Math.min(previous.start, next.start);
		previous.end = Math.max(previous.end, next.end);
		return true;
	}
	return false;
}

// Different wording and single-word fragments are retained rather than guessed away.
export function mergeTranscripts(results: ChunkTranscript[]): TranscriptSegment[] {
	const output: TranscriptSegment[] = [];
	for (const { chunk, segments } of [...results].sort((a, b) => a.chunk.index - b.chunk.index)) {
		const previousTail = output.slice(-8);
		for (const local of segments) {
			const segment = {
				...local,
				start: chunk.startSeconds + local.start,
				end: chunk.startSeconds + local.end,
			};
			const text = normalized(segment.text);
			const duplicate =
				segment.start < chunk.ownedStartSeconds && text.length >= 4
					? previousTail.find(
							(previous) =>
								normalized(previous.text) === text &&
								previous.end > chunk.startSeconds &&
								Math.min(previous.end, segment.end) > Math.max(previous.start, segment.start),
						)
					: undefined;
			if (duplicate) {
				duplicate.end = Math.max(duplicate.end, segment.end);
				continue;
			}
			const previous = previousTail[previousTail.length - 1];
			if (
				previous &&
				segment.start < chunk.ownedStartSeconds &&
				previous.end > chunk.startSeconds &&
				Math.min(previous.end, segment.end) > Math.max(previous.start, segment.start) &&
				joinBoundary(previous, segment)
			)
				continue;
			output.push(segment);
		}
	}
	return output.sort((a, b) => a.start - b.start);
}
