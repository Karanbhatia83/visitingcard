// Lightweight DB-backed rate limit using the audit log as the counter.
// Good enough for per-user throttling on serverless without extra infra.
import { prisma } from '@/lib/prisma';

export async function checkScanRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const limit = Number(process.env.RATE_LIMIT_SCANS_PER_HOUR ?? 60);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.scan.count({
    where: { userId, createdAt: { gte: since } },
  });
  return { allowed: count < limit, remaining: Math.max(0, limit - count), limit };
}
