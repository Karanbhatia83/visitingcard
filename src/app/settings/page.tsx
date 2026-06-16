import { requireUserId } from '@/lib/session';
import { auth } from '@/auth';
import { AppShell } from '@/components/app-shell';
import { SettingsPanel } from '@/components/settings-panel';
import { getOrCreateSettings } from '@/lib/contact-service';
import { initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await requireUserId();
  const session = await auth();
  const settings = await getOrCreateSettings(userId);

  const name = session?.user?.name || 'Signed in';
  const email = session?.user?.email || '';

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>

        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
          >
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{name}</p>
            {email && <p className="truncate text-base text-muted-foreground">{email}</p>}
          </div>
        </div>

        <div className="mt-8">
          <SettingsPanel
            initialAutoSync={settings.autoSyncGoogle}
            initialDeleteFromGoogle={settings.deleteFromGoogle}
          />
        </div>
      </div>
    </AppShell>
  );
}
