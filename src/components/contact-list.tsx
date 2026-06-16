import Link from 'next/link';
import { initials } from '@/lib/utils';
import { SyncBadge } from '@/components/sync-badge';
import { ChevronRight } from 'lucide-react';
import type { SyncStatus } from '@prisma/client';

export interface ContactListItem {
  id: string;
  fullName: string;
  company: string | null;
  designation: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  syncStatus: SyncStatus;
}

export function ContactList({ contacts }: { contacts: ContactListItem[] }) {
  if (contacts.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-lg text-muted-foreground">
        No contacts yet. Tap Scan to add your first card.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {contacts.map((c) => {
        const sub = [c.designation, c.company].filter(Boolean).join(' · ');
        return (
          <li key={c.id}>
            <Link
              href={`/contacts/${c.id}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary"
              >
                {initials(c.fullName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xl font-semibold text-foreground">
                  {c.fullName || 'Unnamed'}
                </span>
                {sub && (
                  <span className="block truncate text-base text-muted-foreground">{sub}</span>
                )}
                {c.primaryPhone && (
                  <span className="block truncate text-base text-muted-foreground">
                    {c.primaryPhone}
                  </span>
                )}
                <span className="mt-2 inline-flex">
                  <SyncBadge status={c.syncStatus} />
                </span>
              </span>
              <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
