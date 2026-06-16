import type { ExtractionResult } from '@/types';

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  /** imageBase64 is bare base64 (no data: prefix). */
  extract(imageBase64: string, mimeType: string): Promise<ExtractionResult>;
}
