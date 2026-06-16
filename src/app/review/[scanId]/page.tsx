import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import { ContactForm } from '@/components/contact-form';
import { Button } from '@/components/ui/button';
import { toStringArray } from '@/lib/utils';
import { EMPTY_CARD, type ExtractedCard } from '@/types';
import { AlertTriangle, Camera } from 'lucide-react';

export default async function ReviewPage({ params }: { params: { scanId: string } }) {
  const userId = await requireUserId();

  const scan = await prisma.scan.findFirst({
    where: { id: params.scanId, userId },
  });
  if (!scan) notFound();

  if (scan.status === 'FAILED') {
    return (
      <AppShell hideNav>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-9" aria-hidden />
          </span>
          <h1 className="font-display text-2xl font-bold">We couldn&apos;t read that card</h1>
          <p className="text-lg text-muted-foreground">
            {scan.errorMessage || 'The photo may have been blurry or too dark.'}
          </p>
          <Button asChild size="lg" variant="accent" className="w-full">
            <Link href="/scan">
              <Camera aria-hidden />
              Try again
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const raw = (scan.aiOutput as Record<string, unknown>) || {};
  const initial: ExtractedCard = {
    ...EMPTY_CARD,
    fullName: typeof raw.fullName === 'string' ? raw.fullName : '',
    company: typeof raw.company === 'string' ? raw.company : '',
    designation: typeof raw.designation === 'string' ? raw.designation : '',
    website: typeof raw.website === 'string' ? raw.website : '',
    linkedin: typeof raw.linkedin === 'string' ? raw.linkedin : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    mobileNumbers: toStringArray(raw.mobileNumbers),
    officeNumbers: toStringArray(raw.officeNumbers),
    emails: toStringArray(raw.emails),
  };

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Review details</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Check what we found and fix anything before saving.
        </p>

        {scan.cardImageKey && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image?key=${encodeURIComponent(scan.cardImageKey)}`}
              alt="Scanned business card"
              className="w-full object-cover"
            />
          </div>
        )}

        <div className="mt-7">
          <ContactForm initial={initial} mode="create" scanId={scan.id} />
        </div>
      </div>
    </AppShell>
  );
}
