'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { RefreshCw, Trash2, Loader2 } from 'lucide-react';
import type { SyncStatus } from '@prisma/client';

export function ContactActions({
  id,
  syncStatus,
}: {
  id: string;
  syncStatus: SyncStatus;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/contacts/${id}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Sync failed.');
      if (data?.contact?.syncStatus === 'SYNCED') toast.success('Synced to Google Contacts.');
      else toast.warning('Sync did not complete. Please try again.');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not delete.');
      toast.success('Contact deleted.');
      router.push('/contacts');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not delete.');
      setDeleting(false);
      setConfirm(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={sync}
        disabled={syncing || syncStatus === 'SYNCED'}
      >
        {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        {syncStatus === 'SYNCED' ? 'Synced with Google' : 'Sync to Google'}
      </Button>

      <Button
        variant="ghost"
        size="lg"
        className="w-full text-destructive hover:bg-destructive/10"
        onClick={() => setConfirm(true)}
      >
        <Trash2 aria-hidden />
        Delete contact
      </Button>

      <Dialog open={confirm} onOpenChange={(o) => !deleting && setConfirm(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this contact?</DialogTitle>
            <DialogDescription>
              This removes it from the app. Depending on your settings it may also be removed from
              Google Contacts. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              variant="destructive"
              size="lg"
              className="w-full"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Yes, delete
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => setConfirm(false)}
              disabled={deleting}
            >
              Keep contact
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
