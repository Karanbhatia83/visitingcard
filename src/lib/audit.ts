import { prisma } from '@/lib/prisma';

export async function audit(params: {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata: params.metadata as object | undefined,
      },
    });
  } catch {
    // Auditing must never break the main flow.
  }
}
