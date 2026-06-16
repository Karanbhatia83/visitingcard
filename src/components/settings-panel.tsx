'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { InstallPwaButton } from '@/components/install-pwa';
import { RefreshCw, Loader2, LogOut, FileText, FileSpreadsheet, Contact } from 'lucide-react';

export function SettingsPanel({
  initialAutoSync,
  initialDeleteFromGoogle,
}: {
  initialAutoSync: boolean;
  initialDeleteFromGoogle: boolean;
}) {
  const router = useRouter();
  const [autoSync, setAutoSync] = useState(initialAutoSync);
  const [deleteFromGoogle, setDeleteFromGoogle] = useState(initialDeleteFromGoogle);
  const [resyncing, startResync] = useTransition();
  const [savingPref, setSavingPref] = useState(false);

  async function savePref(next: { autoSyncGoogle?: boolean; deleteFromGoogle?: boolean }) {
    setSavingPref(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('Could not save setting.');
    } catch (e) {
      toast.error((e as Error).message || 'Could not save setting.');
      // revert
      if (next.autoSyncGoogle !== undefined) setAutoSync(!next.autoSyncGoogle);
      if (next.deleteFromGoogle !== undefined) setDeleteFromGoogle(!next.deleteFromGoogle);
    } finally {
      setSavingPref(false);
    }
  }

  function resync() {
    startResync(async () => {
      try {
        const res = await fetch('/api/google/resync', { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Sync failed.');
        toast.success(`Synced. ${data.imported} added, ${data.updated} updated.`);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message || 'Could not sync from Google.');
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Google sync
        </h2>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0">
            <Label htmlFor="autoSync" className="text-lg">
              Save to Google automatically
            </Label>
            <p className="mt-1 text-base text-muted-foreground">
              New contacts are added to Google Contacts when you save.
            </p>
          </div>
          <Switch
            id="autoSync"
            checked={autoSync}
            disabled={savingPref}
            onCheckedChange={(v) => {
              setAutoSync(v);
              savePref({ autoSyncGoogle: v });
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="min-w-0">
            <Label htmlFor="deleteFromGoogle" className="text-lg">
              Also delete from Google
            </Label>
            <p className="mt-1 text-base text-muted-foreground">
              When you delete a contact here, remove it from Google too.
            </p>
          </div>
          <Switch
            id="deleteFromGoogle"
            checked={deleteFromGoogle}
            disabled={savingPref}
            onCheckedChange={(v) => {
              setDeleteFromGoogle(v);
              savePref({ deleteFromGoogle: v });
            }}
          />
        </div>

        <Button variant="outline" size="lg" className="w-full" onClick={resync} disabled={resyncing}>
          {resyncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
          Import from Google Contacts
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Export all contacts
        </h2>
        <Button asChild variant="outline" className="w-full justify-start">
          <a href="/api/export?format=csv">
            <FileText aria-hidden /> CSV (.csv)
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start">
          <a href="/api/export?format=xlsx">
            <FileSpreadsheet aria-hidden /> Excel (.xlsx)
          </a>
        </Button>
        <Button asChild variant="outline" className="w-full justify-start">
          <a href="/api/export?format=vcf">
            <Contact aria-hidden /> vCard (.vcf)
          </a>
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">App</h2>
        <InstallPwaButton />
        <Button
          variant="ghost"
          size="lg"
          className="w-full text-destructive hover:bg-destructive/10"
          onClick={() => signOut({ callbackUrl: '/' })}
        >
          <LogOut aria-hidden />
          Sign out
        </Button>
      </section>
    </div>
  );
}
