import { requireUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import { ContactsToolbar } from '@/components/contacts-toolbar';
import { ContactList, type ContactListItem } from '@/components/contact-list';
import type { Prisma, SyncStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const SYNC_VALUES: SyncStatus[] = ['SYNCED', 'LOCAL_ONLY', 'PENDING', 'FAILED'];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string; filter?: string };
}) {
  const userId = await requireUserId();

  const q = (searchParams.q || '').trim();
  const sort = searchParams.sort === 'recent' ? 'recent' : 'name';
  const filter = searchParams.filter;

  const where: Prisma.ContactWhereInput = { userId };
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
      { primaryEmail: { contains: q, mode: 'insensitive' } },
      { primaryPhone: { contains: q } },
    ];
  }
  if (filter && (SYNC_VALUES as string[]).includes(filter)) {
    where.syncStatus = filter as SyncStatus;
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: sort === 'recent' ? { createdAt: 'desc' } : { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      company: true,
      designation: true,
      primaryPhone: true,
      primaryEmail: true,
      syncStatus: true,
    },
    take: 500,
  });

  const total = await prisma.contact.count({ where: { userId } });

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight">Contacts</h1>
          <span className="text-lg font-medium text-muted-foreground">{total}</span>
        </div>

        <div className="mt-6">
          <ContactsToolbar />
        </div>

        <div className="mt-6">
          <ContactList contacts={contacts as ContactListItem[]} />
        </div>
      </div>
    </AppShell>
  );
}
