import { EMPTY_CARD, type ExtractedCard, type ExtractionResult } from '@/types';
import type { AIProvider } from './types';

/** Strip code fences and parse the JSON the model returned into a typed result. */
export function parseExtraction(
  text: string,
  provider: string,
  model: string
): ExtractionResult {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  // Be forgiving: grab the first {...} block if there is stray text.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(jsonStr);
  } catch {
    throw new Error('The AI response was not valid JSON. Please retake the photo.');
  }

  const asArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean) : [];
  const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const card: ExtractedCard = {
    ...EMPTY_CARD,
    fullName: asStr(data.fullName),
    company: asStr(data.company),
    designation: asStr(data.designation),
    mobileNumbers: asArr(data.mobileNumbers),
    officeNumbers: asArr(data.officeNumbers),
    emails: asArr(data.emails).map((e) => e.toLowerCase()),
    website: asStr(data.website),
    linkedin: asStr(data.linkedin),
    address: asStr(data.address),
    notes: asStr(data.notes),
  };

  return { card, rawText: asStr(data.rawText), provider, model };
}

/** Factory: pick the provider from AI_PROVIDER (lazy-imported to avoid loading all SDKs). */
export async function getAIProvider(): Promise<AIProvider> {
  const choice = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  switch (choice) {
    case 'openai': {
      const { OpenAIProvider } = await import('./openai');
      return new OpenAIProvider();
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./gemini');
      return new GeminiProvider();
    }
    case 'anthropic':
    default: {
      const { AnthropicProvider } = await import('./anthropic');
      return new AnthropicProvider();
    }
  }
}

export async function extractBusinessCard(
  imageBase64: string,
  mimeType: string
): Promise<ExtractionResult> {
  const provider = await getAIProvider();
  return provider.extract(imageBase64, mimeType);
}
