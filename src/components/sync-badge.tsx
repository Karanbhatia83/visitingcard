import { Badge } from '@/components/ui/badge';
import { Check, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import type { SyncStatus } from '@prisma/client';

const MAP: Record<
  SyncStatus,
  { label: string; variant: 'success' | 'muted' | 'warning' | 'destructive'; Icon: typeof Check }
> = {
  SYNCED: { label: 'In Google', variant: 'success', Icon: Check },
  LOCAL_ONLY: { label: 'On device', variant: 'muted', Icon: CloudOff },
  PENDING: { label: 'Syncing', variant: 'warning', Icon: RefreshCw },
  FAILED: { label: 'Sync failed', variant: 'destructive', Icon: AlertTriangle },
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  const { label, variant, Icon } = MAP[status] ?? MAP.LOCAL_ONLY;
  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon className="size-4" aria-hidden />
      {label}
    </Badge>
  );
}
