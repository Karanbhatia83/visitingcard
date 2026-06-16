// Shared application types.

export interface ExtractedCard {
  fullName: string;
  company: string;
  designation: string;
  mobileNumbers: string[];
  officeNumbers: string[];
  emails: string[];
  website: string;
  linkedin: string;
  address: string;
  notes: string;
}

export interface ExtractionResult {
  card: ExtractedCard;
  rawText: string;
  provider: string;
  model: string;
}

export interface DuplicateMatch {
  source: 'google' | 'local';
  resourceName?: string; // google
  localId?: string; // local
  fullName: string;
  company?: string;
  emails: string[];
  phones: string[];
  matchedOn: ('email' | 'phone')[];
}

export const EMPTY_CARD: ExtractedCard = {
  fullName: '',
  company: '',
  designation: '',
  mobileNumbers: [],
  officeNumbers: [],
  emails: [],
  website: '',
  linkedin: '',
  address: '',
  notes: '',
};
