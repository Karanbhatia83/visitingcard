import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import { ContactForm } from '@/components/contact-form';
import { Button } from '@/components/ui/button';
import { toStringArray } from '@/lib/utils';
import { EMPTY_CARD, type ExtractedCard } from '@/types';
import { ArrowLeft } from 'lucide-react';

export default async function EditContactPage({ params }: { params: { id: string } }) {
  const userId = await requireUserId();
  const c = await prisma.contact.findFirst({ where: { id: params.id, userId } });
  if (!c) notFound();

  const initial: ExtractedCard = {
    ...EMPTY_CARD,
    fullName: c.fullName || '',
    company: c.company || '',
    designation: c.designation || '',
    website: c.website || '',
    linkedin: c.linkedin || '',
    address: c.address || '',
    notes: c.notes || '',
    mobileNumbers: toStringArray(c.mobileNumbers),
    officeNumbers: toStringArray(c.officeNumbers),
    emails: toStringArray(c.emails),
  };

  return (
    <AppShell>
      <div className="px-5 pt-6">
        <Button asChild variant="ghost" size="icon" aria-label="Back to contact">
          <Link href={`/contacts/${c.id}`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>

        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Edit contact</h1>
        <p className="mt-2 text-lg text-muted-foreground">Update the details and save.</p>

        <div className="mt-7">
          <ContactForm initial={initial} mode="edit" contactId={c.id} />
        </div>
      </div>
    </AppShell>
  );
}
