'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { UserCheck, UserPlus, Phone, Mail, Building2 } from 'lucide-react';
import type { DuplicateMatch } from '@/types';

export interface ResolveChoice {
  resolution: 'update' | 'create_anyway';
  updateGoogleResourceName?: string;
  updateLocalId?: string;
}

export function DuplicateDialog({
  open,
  matches,
  saving,
  onResolve,
  onCancel,
}: {
  open: boolean;
  matches: DuplicateMatch[];
  saving: boolean;
  onResolve: (choice: ResolveChoice) => void;
  onCancel: () => void;
}) {
  // Prefer a Google match to update (keeps the address book canonical).
  const primary =
    matches.find((m) => m.source === 'google') ?? matches[0] ?? undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Possible duplicate</DialogTitle>
          <DialogDescription>
            We found {matches.length} contact{matches.length > 1 ? 's' : ''} that look
            {matches.length > 1 ? '' : 's'} similar. What would you like to do?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {matches.map((m, i) => (
            <div key={(m.resourceName || m.localId || '') + i} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-semibold">{m.fullName || 'Unnamed'}</p>
                <Badge variant={m.source === 'google' ? 'success' : 'muted'}>
                  {m.source === 'google' ? 'Google' : 'On device'}
                </Badge>
              </div>
              {m.company && (
                <p className="mt-1 flex items-center gap-2 text-base text-muted-foreground">
                  <Building2 className="size-4" aria-hidden /> {m.company}
                </p>
              )}
              {m.phones.slice(0, 2).map((p) => (
                <p key={p} className="mt-1 flex items-center gap-2 text-base text-muted-foreground">
                  <Phone className="size-4" aria-hidden /> {p}
                </p>
              ))}
              {m.emails.slice(0, 2).map((e) => (
                <p key={e} className="mt-1 flex items-center gap-2 text-base text-muted-foreground">
                  <Mail className="size-4" aria-hidden /> {e}
                </p>
              ))}
              <p className="mt-2 text-sm text-muted-foreground">
                Matched on {m.matchedOn.join(' & ')}
              </p>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex flex-col gap-3 pt-2">
          {primary && (
            <Button
              size="lg"
              className="w-full"
              disabled={saving}
              onClick={() =>
                onResolve({
                  resolution: 'update',
                  updateGoogleResourceName: primary.resourceName,
                  updateLocalId: primary.localId,
                })
              }
            >
              <UserCheck aria-hidden />
              Update existing contact
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            disabled={saving}
            onClick={() => onResolve({ resolution: 'create_anyway' })}
          >
            <UserPlus aria-hidden />
            Save as new contact
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full"
            disabled={saving}
            onClick={onCancel}
          >
            Go back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
