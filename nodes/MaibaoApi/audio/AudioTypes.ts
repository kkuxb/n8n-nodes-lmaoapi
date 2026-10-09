export interface AudioChunk {
	index: number;
	bytes: Uint8Array;
	startSeconds: number;
	durationSeconds: number;
	ownedStartSeconds: number;
	ownedEndSeconds: number;
}

export interface TranscriptSegment {
	start: number;
	end: number;
	text: string;
}
