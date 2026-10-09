import { TranscriptSegment } from './AudioTypes';

function clock(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const pair = (n: number) => String(n).padStart(2, '0');
	return h ? `${pair(h)}:${pair(m)}:${pair(s)}` : `${pair(m)}:${pair(s)}`;
}

export function renderTranscriptMarkdown(segments: TranscriptSegment[]): string {
	return segments
		.map((segment) => {
			const text = segment.text
				.replace(/\s+/g, ' ')
				.trim()
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/([\\`*_{}[\]()#+.!|~-])/g, '\\$1');
			return `- **[${clock(Math.floor(segment.start))}–${clock(Math.ceil(segment.end))}]** ${text}`;
		})
		.join('\n');
}
