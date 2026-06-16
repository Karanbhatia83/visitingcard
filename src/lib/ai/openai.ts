import OpenAI from 'openai';
import { EXTRACTION_SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import { parseExtraction } from './index';
import type { AIProvider } from './types';
import type { ExtractionResult } from '@/types';

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly model = process.env.OPENAI_MODEL || 'gpt-4o';
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    this.client = new OpenAI({ apiKey });
  }

  async extract(imageBase64: string, mimeType: string): Promise<ExtractionResult> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: USER_INSTRUCTION },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    });
    const text = res.choices[0]?.message?.content ?? '';
    return parseExtraction(text, this.name, this.model);
  }
}
