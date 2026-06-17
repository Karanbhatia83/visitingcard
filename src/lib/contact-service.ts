import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { normaliseEmail, normalisePhone } from '@/lib/utils';
import {
  createGoogleContact,
  updateGoogleContact,
  deleteGoogleContact,
  listGoogleConnections,
} from '@/lib/google/contacts';
import type { CardInput, SaveContactInput } from '@/lib/validation';
import type { DuplicateMatch } from '@/types';

export async function getOrCreateSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function cardToData(card: CardInput, cardImageKey?: string | null) {
  return {
    fullName: card.fullName,
    company: card.company || null,
    designation: card.designation || null,
    website: card.website || null,
    linkedin: card.linkedin || null,
    address: card.address || null,
    notes: card.notes || null,
    mobileNumbers: card.mobileNumbers,
    officeNumbers: card.officeNumbers,
    emails: card.emails,
    primaryEmail: card.emails[0] ? normaliseEmail(card.emails[0]) : null,
    primaryPhone: card.mobileNumbers[0]
      ? normalisePhone(card.mobileNumbers[0])
      : card.officeNumbers[0]
        ? normalisePhone(card.officeNumbers[0])
        : null,
    ...(cardImageKey !== undefined ? { cardImageKey } : {}),
  };
}

// Local duplicate search within the user's own saved contacts.
export async function findLocalDuplicates(
  userId: string,
  card: CardInput
): Promise<DuplicateMatch[]> {
  const emails = card.emails.map(normaliseEmail).filter(Boolean);
  const phones = [...card.mobileNumbers, ...card.officeNumbers]
    .map(normalisePhone)
    .filter(Boolean);
  if (!emails.length && !phones.length) return [];

  const rows = await prisma.contact.findMany({
    where: {
      userId,
      OR: [
        emails.length ? { primaryEmail: { in: emails } } : undefined,
        phones.length ? { primaryPhone: { in: phones } } : undefined,
      ].filter(Boolean) as object[],
    },
    take: 10,
  });

  return rows.map((r) => {
    const matchedOn: ('email' | 'phone')[] = [];
    if (r.primaryEmail && emails.includes(r.primaryEmail)) matchedOn.push('email');
    if (r.primaryPhone && phones.includes(r.primaryPhone)) matchedOn.push('phone');
    return {
      source: 'local' as const,
      localId: r.id,
      fullName: r.fullName,
      company: r.company ?? undefined,
      emails: (r.emails as string[]) ?? [],
      phones: [...((r.mobileNumbers as string[]) ?? []), ...((r.officeNumbers as string[]) ?? [])],
      matchedOn,
    };
  });
}

export async function saveContact(userId: string, input: SaveContactInput) {
  const settings = await getOrCreateSettings(userId);
  const card: CardInput = input;

  // Resolve the stored card image from the scan, if any.
  let cardImageKey: string | null | undefined;
  if (input.scanId) {
    const scan = await prisma.scan.findFirst({
      where: { id: input.scanId, userId },
      select: { cardImageKey: true },
    });
    cardImageKey = scan?.cardImageKey ?? null;
  }

  // UPDATE path: merge into an existing record.
  if (input.resolution === 'update' && (input.updateLocalId || input.updateGoogleResourceName)) {
    let local = input.updateLocalId
      ? await prisma.contact.findFirst({ where: { id: input.updateLocalId, userId } })
      : await prisma.contact.findFirst({
          where: { userId, googleResourceName: input.updateGoogleResourceName },
        });

    const resourceName = local?.googleResourceName || input.updateGoogleResourceName || null;
    let etag: string | null = local?.googleEtag ?? null;
    let syncStatus: 'SYNCED' | 'FAILED' | 'LOCAL_ONLY' = 'LOCAL_ONLY';
    let syncError: string | null = null;

    if (resourceName && settings.autoSyncGoogle) {
      try {
        const ref = await updateGoogleContact(userId, resourceName, card);
        etag = ref.etag;
        syncStatus = 'SYNCED';
      } catch (e) {
        syncStatus = 'FAILED';
        syncError = (e as Error).message;
      }
    }

    const data = {
      ...cardToData(card, cardImageKey),
      googleResourceName: resourceName,
      googleEtag: etag,
      syncStatus,
      syncError,
      lastSyncedAt: syncStatus === 'SYNCED' ? new Date() : local?.lastSyncedAt ?? null,
    };

    const contact = local
      ? await prisma.contact.update({ where: { id: local.id }, data })
      : await prisma.contact.create({ data: { ...data, userId } });

    if (input.scanId) {
      await prisma.scan.update({
        where: { id: input.scanId },
        data: { status: 'SAVED', contactId: contact.id },
      });
    }
    await audit({ userId, action: 'CONTACT_UPDATE', entity: 'Contact', entityId: contact.id });
    return contact;
  }

  // CREATE path (also used for "create anyway").
  let resourceName: string | null = null;
  let etag: string | null = null;
  let syncStatus: 'SYNCED' | 'FAILED' | 'LOCAL_ONLY' = 'LOCAL_ONLY';
  let syncError: string | null = null;

  if (settings.autoSyncGoogle) {
    try {
      const ref = await createGoogleContact(userId, card);
      resourceName = ref.resourceName;
      etag = ref.etag;
      syncStatus = 'SYNCED';
    } catch (e) {
      syncStatus = 'FAILED';
      syncError = (e as Error).message;
    }
  }

  const contact = await prisma.contact.create({
    data: {
      userId,
      ...cardToData(card, cardImageKey),
      googleResourceName: resourceName,
      googleEtag: etag,
      syncStatus,
      syncError,
      lastSyncedAt: syncStatus === 'SYNCED' ? new Date() : null,
    },
  });

  if (input.scanId) {
    await prisma.scan.update({
      where: { id: input.scanId },
      data: { status: 'SAVED', contactId: contact.id },
    });
  }
  await audit({
    userId,
    action: 'CONTACT_CREATE',
    entity: 'Contact',
    entityId: contact.id,
    metadata: { syncStatus },
  });
  return contact;
}

export async function updateContactById(userId: string, id: string, card: CardInput) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Contact not found');

  let etag = existing.googleEtag;
  let syncStatus = existing.syncStatus;
  let syncError: string | null = null;

  if (existing.googleResourceName) {
    try {
      const ref = await updateGoogleContact(userId, existing.googleResourceName, card);
      etag = ref.etag;
      syncStatus = 'SYNCED';
    } catch (e) {
      syncStatus = 'FAILED';
      syncError = (e as Error).message;
    }
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      ...cardToData(card),
      googleEtag: etag,
      syncStatus,
      syncError,
      lastSyncedAt: syncStatus === 'SYNCED' ? new Date() : existing.lastSyncedAt,
    },
  });
  await audit({ userId, action: 'CONTACT_UPDATE', entity: 'Contact', entityId: id });
  return contact;
}

export async function deleteContactById(userId: string, id: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Contact not found');
  const settings = await getOrCreateSettings(userId);

  if (existing.googleResourceName && settings.deleteFromGoogle) {
    try {
      await deleteGoogleContact(userId, existing.googleResourceName);
    } catch {
      // Continue local delete even if Google delete fails.
    }
  }
  await prisma.contact.delete({ where: { id } });
  await audit({ userId, action: 'CONTACT_DELETE', entity: 'Contact', entityId: id });
}

export async function syncContactById(userId: string, id: string) {
  const existing = await prisma.contact.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Contact not found');

  const card: CardInput = {
    fullName: existing.fullName,
    company: existing.company ?? '',
    designation: existing.designation ?? '',
    mobileNumbers: (existing.mobileNumbers as string[]) ?? [],
    officeNumbers: (existing.officeNumbers as string[]) ?? [],
    emails: (existing.emails as string[]) ?? [],
    website: existing.website ?? '',
    linkedin: existing.linkedin ?? '',
    address: existing.address ?? '',
    notes: existing.notes ?? '',
  };

  const ref = existing.googleResourceName
    ? await updateGoogleContact(userId, existing.googleResourceName, card)
    : await createGoogleContact(userId, card);

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      googleResourceName: ref.resourceName,
      googleEtag: ref.etag,
      syncStatus: 'SYNCED',
      syncError: null,
      lastSyncedAt: new Date(),
    },
  });
  await audit({ userId, action: 'GOOGLE_SYNC', entity: 'Contact', entityId: id });
  return contact;
}

/**
 * Import the user's Google Contacts into the local store. Existing records are
 * matched by googleResourceName and refreshed; new ones are created and marked
 * as SYNCED. Phone numbers from Google are stored as mobile numbers (the People
 * connections feed does not reliably distinguish mobile vs office).
 */
export async function resyncFromGoogle(userId: string) {
  const people = await listGoogleConnections(userId);
  let imported = 0;
  let updated = 0;

  // Process in small concurrent batches so a large address book imports quickly.
  // (Doing these one-by-one was slow enough to risk the serverless time limit.)
  const BATCH = 25;
  for (let i = 0; i < people.length; i += BATCH) {
    const batch = people.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (p) => {
        const fullName = p.names?.[0]?.displayName || p.names?.[0]?.givenName || '';
        const emails = (p.emailAddresses || []).map((e) => e.value || '').filter(Boolean);
        const phones = (p.phoneNumbers || []).map((e) => e.value || '').filter(Boolean);
        if (!fullName && emails.length === 0 && phones.length === 0) return 'skip' as const;

        const primaryEmail = emails[0] ? normaliseEmail(emails[0]) : null;
        const primaryPhone = phones[0] ? normalisePhone(phones[0]) : null;

        const existing = await prisma.contact.findUnique({
          where: { googleResourceName: p.resourceName },
        });

        const base = {
          fullName: fullName || '(no name)',
          company: p.organizations?.[0]?.name || null,
          emails: emails as unknown as object,
          mobileNumbers: phones as unknown as object,
          primaryEmail,
          primaryPhone,
          googleResourceName: p.resourceName,
          syncStatus: 'SYNCED' as const,
          lastSyncedAt: new Date(),
          syncError: null,
        };

        if (existing) {
          if (existing.userId !== userId) return 'skip' as const;
          await prisma.contact.update({ where: { id: existing.id }, data: base });
          return 'updated' as const;
        }
        await prisma.contact.create({ data: { userId, ...base } });
        return 'imported' as const;
      })
    );
    for (const r of results) {
      if (r === 'imported') imported += 1;
      else if (r === 'updated') updated += 1;
    }
  }

  await audit({ userId, action: 'RESYNC', metadata: { imported, updated } });
  return { imported, updated, total: people.length };
}
