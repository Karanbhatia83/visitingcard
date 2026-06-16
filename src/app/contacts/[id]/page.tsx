import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SyncBadge } from '@/components/sync-badge';
import { ContactActions } from '@/components/contact-actions';
import { initials, toStringArray, formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  Pencil,
  Phone,
  Smartphone,
  Mail,
  Globe,
  Linkedin,
  MapPin,
  StickyNote,
  Download,
} from 'lucide-react';

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-3">
      <span className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-lg text-foreground">{children}</div>
      </div>
    </div>
  );
}

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const userId = await requireUserId();
  const c = await prisma.contact.findFirst({ where: { id: params.id, userId } });
  if (!c) notFound();

  const mobiles = toStringArray(c.mobileNumbers);
  const offices = toStringArray(c.officeNumbers);
  const emails = toStringArray(c.emails);

  return (
    <AppShell>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="icon" aria-label="Back to contacts">
            <Link href="/contacts">
              <ArrowLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="text-primary">
            <Link href={`/contacts/${c.id}/edit`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary"
          >
            {initials(c.fullName)}
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">{c.fullName}</h1>
          {(c.designation || c.company) && (
            <p className="mt-1 text-xl text-muted-foreground">
              {[c.designation, c.company].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="mt-3">
            <SyncBadge status={c.syncStatus} />
          </div>
        </div>

        {c.syncStatus === 'FAILED' && c.syncError && (
          <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-base text-destructive">
            {c.syncError}
          </p>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card px-4">
          {mobiles.map((m, i) => (
            <Row key={`m${i}`} icon={<Smartphone className="size-5" aria-hidden />} label="Mobile">
              <a href={`tel:${m}`} className="text-primary underline-offset-4 hover:underline">
                {m}
              </a>
            </Row>
          ))}
          {offices.map((m, i) => (
            <Row key={`o${i}`} icon={<Phone className="size-5" aria-hidden />} label="Office">
              <a href={`tel:${m}`} className="text-primary underline-offset-4 hover:underline">
                {m}
              </a>
            </Row>
          ))}
          {emails.map((e, i) => (
            <Row key={`e${i}`} icon={<Mail className="size-5" aria-hidden />} label="Email">
              <a href={`mailto:${e}`} className="break-all text-primary underline-offset-4 hover:underline">
                {e}
              </a>
            </Row>
          ))}
          {c.website && (
            <Row icon={<Globe className="size-5" aria-hidden />} label="Website">
              <a
                href={c.website.startsWith('http') ? c.website : `https://${c.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary underline-offset-4 hover:underline"
              >
                {c.website}
              </a>
            </Row>
          )}
          {c.linkedin && (
            <Row icon={<Linkedin className="size-5" aria-hidden />} label="LinkedIn">
              <a
                href={c.linkedin.startsWith('http') ? c.linkedin : `https://${c.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-primary underline-offset-4 hover:underline"
              >
                {c.linkedin}
              </a>
            </Row>
          )}
          {c.address && (
            <Row icon={<MapPin className="size-5" aria-hidden />} label="Address">
              {c.address}
            </Row>
          )}
          {c.notes && (
            <Row icon={<StickyNote className="size-5" aria-hidden />} label="Notes">
              {c.notes}
            </Row>
          )}
        </div>

        {c.cardImageKey && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Card image
            </p>
            <div className="overflow-hidden rounded-2xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/image?key=${encodeURIComponent(c.cardImageKey)}`}
                alt={`Business card for ${c.fullName}`}
                className="w-full object-cover"
              />
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button asChild variant="outline" size="lg" className="w-full">
            <a href={`/api/export?format=vcf&ids=${c.id}`}>
              <Download aria-hidden />
              Save as vCard (.vcf)
            </a>
          </Button>
        </div>

        <Separator className="my-6" />

        <ContactActions id={c.id} syncStatus={c.syncStatus} />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Added {formatDate(c.createdAt)}
        </p>
      </div>
    </AppShell>
  );
}
