import { IExecuteFunctions, IDataObject } from 'n8n-workflow';

// Whisper API 响应中的词条目
export interface WhisperWord {
	word: string;
	start: number;
	end: number;
}

// Whisper API 响应
export interface WhisperResponse {
	text?: string;
	words?: WhisperWord[];
	[key: string]: unknown;
}

// 将词级别时间戳转换为句级别时间戳
export function convertWordsToSentences(data: WhisperResponse): WhisperResponse {
	if (!data.text || !data.words || data.words.length === 0) {
		return data;
	}

	// 按空格分割句子
	const sentences = data.text.split(' ').filter((s: string) => s.trim());
	const words = data.words;
	let wordIndex = 0;
	const result = [];

	for (const sentence of sentences) {
		if (!sentence.trim()) continue;

		// 移除句子中的空格，得到纯文本用于匹配
		const sentenceText = sentence.replace(/\s+/g, '');
		const sentenceWords = [];
		let matchedText = '';

		// 匹配句子中的所有词
		while (wordIndex < words.length && matchedText.length < sentenceText.length) {
			const word = words[wordIndex];
			sentenceWords.push(word);
			matchedText += word.word;
			wordIndex++;

			// 如果已经匹配完整个句子，停止
			if (matchedText === sentenceText) {
				break;
			}
		}

		// 如果找到了对应的词，添加句子
		if (sentenceWords.length > 0) {
			result.push({
				text: sentence,
				start: parseFloat(sentenceWords[0].start.toFixed(1)),
				end: parseFloat(sentenceWords[sentenceWords.length - 1].end.toFixed(1)),
			});
		}
	}

	const timeText = result
		.map(
			(sentence) =>
				`[${sentence.start.toFixed(1)}s - ${sentence.end.toFixed(1)}s] ${sentence.text}`,
		)
		.join('\n');

	// 保证 time-text 紧邻且位于 sentences 之前，同时移除词级时间戳
	const convertedData = { ...data };
	delete convertedData.words;
	delete convertedData['time-text'];
	delete convertedData.sentences;

	// 返回新的数据结构，兼顾可直接拖拽的文本和结构化句子
	return {
		...convertedData,
		'time-text': timeText,
		sentences: result,
	};
}

export interface AudioFile {
	buffer: Buffer;
	fileName: string;
	mimeType: string;
	format: string;
	propName: string;
}

export async function transcribeWhisper(
	context: IExecuteFunctions,
	audio: AudioFile,
	baseUrl: string,
	apiKey: string,
	language: string,
	responseFormat: string,
): Promise<IDataObject> {
	const formData = {
		file: {
			value: audio.buffer,
			options: { filename: audio.fileName, contentType: audio.mimeType },
		},
		model: 'whisper-1',
		response_format: responseFormat,
		...(language ? { language } : {}),
		...(responseFormat === 'verbose_json' ? { 'timestamp_granularities[]': 'word' } : {}),
	};
	const response = await context.helpers.request({
		method: 'POST',
		url: `${baseUrl}/audio/transcriptions`,
		headers: { Authorization: `Bearer ${apiKey}` },
		formData,
		json: true,
		timeout: 600000,
	});
	return {
		...(responseFormat === 'text' ? { text: response } : convertWordsToSentences(response)),
		_metadata: {
			model: 'whisper-1',
			format: responseFormat === 'text' ? 'text' : 'verbose_json',
			audioFormat: audio.format,
			sourceProperty: audio.propName,
			...(responseFormat === 'text' ? {} : { timestampGranularity: 'sentence' }),
			...(language ? { language } : {}),
		},
	} as IDataObject;
}
