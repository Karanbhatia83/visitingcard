import { z } from 'zod';

// A blank string is allowed for optional single fields; arrays drop blanks.
const cleanArray = z
  .array(z.string())
  .default([])
  .transform((arr) => arr.map((s) => s.trim()).filter(Boolean));

export const cardSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(200),
  company: z.string().trim().max(200).default(''),
  designation: z.string().trim().max(200).default(''),
  mobileNumbers: cleanArray,
  officeNumbers: cleanArray,
  emails: cleanArray,
  website: z.string().trim().max(300).default(''),
  linkedin: z.string().trim().max(300).default(''),
  address: z.string().trim().max(500).default(''),
  notes: z.string().trim().max(2000).default(''),
});

export type CardInput = z.infer<typeof cardSchema>;

export const scanRequestSchema = z.object({
  // data URL or bare base64 of a downscaled JPEG/PNG.
  image: z.string().min(100, 'Image data is required'),
  mimeType: z.string().default('image/jpeg'),
});

export const saveContactSchema = cardSchema.extend({
  scanId: z.string().optional(),
  // resolution chosen on the duplicate screen
  resolution: z.enum(['create', 'update', 'create_anyway']).default('create'),
  // when updating, which existing record
  updateGoogleResourceName: z.string().optional(),
  updateLocalId: z.string().optional(),
});

export type SaveContactInput = z.infer<typeof saveContactSchema>;
