import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt';
import { parseExtraction } from './index';
import type { AIProvider } from './types';
import type { ExtractionResult } from '@/types';

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey });
  }

  async extract(imageBase64: string, mimeType: string): Promise<ExtractionResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imageBase64,
              },
            },
            { type: 'text', text: USER_INSTRUCTION },
          ],
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return parseExtraction(text, this.name, this.model);
  }
}
