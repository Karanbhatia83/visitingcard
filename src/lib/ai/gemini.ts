import { GoogleGenerativeAI } from '@google/generative-ai';
import { EXTRACTION_SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import { parseExtraction } from './index';
import type { AIProvider } from './types';
import type { ExtractionResult } from '@/types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
  private client: GoogleGenerativeAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async extract(imageBase64: string, mimeType: string): Promise<ExtractionResult> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const res = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: USER_INSTRUCTION },
    ]);
    const text = res.response.text();
    return parseExtraction(text, this.name, this.model);
  }
}
