import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });
  return _client;
}

const BUCKET = () => process.env.S3_BUCKET || '';

/** Upload a card image (Buffer) and return its object key. */
export async function uploadCardImage(
  userId: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const key = `cards/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, max-age=31536000',
    })
  );
  return key;
}

/** Public URL if the bucket is public, else a short-lived signed URL. */
export async function getImageUrl(key: string): Promise<string> {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, '')}/${key}`;
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: BUCKET(), Key: key }),
    { expiresIn: 60 * 30 }
  );
}

export async function deleteImage(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}
