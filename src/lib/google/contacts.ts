import { getGoogleAccessToken } from './tokens';
import { normaliseEmail, normalisePhone } from '@/lib/utils';
import type { CardInput } from '@/lib/validation';
import type { DuplicateMatch } from '@/types';

const PEOPLE = 'https://people.googleapis.com/v1';

function buildPersonBody(card: CardInput) {
  return {
    names: card.fullName ? [{ givenName: card.fullName }] : undefined,
    organizations:
      card.company || card.designation
        ? [{ name: card.company || undefined, title: card.designation || undefined }]
        : undefined,
    phoneNumbers: [
      ...card.mobileNumbers.map((v) => ({ value: v, type: 'mobile' })),
      ...card.officeNumbers.map((v) => ({ value: v, type: 'work' })),
    ],
    emailAddresses: card.emails.map((v) => ({ value: v })),
    urls: [
      ...(card.website ? [{ value: card.website, type: 'work' }] : []),
      ...(card.linkedin ? [{ value: card.linkedin, type: 'linkedin' }] : []),
    ],
    addresses: card.address ? [{ formattedValue: card.address, type: 'work' }] : undefined,
    biographies: card.notes ? [{ value: card.notes, contentType: 'TEXT_PLAIN' }] : undefined,
  };
}

async function gfetch(userId: string, path: string, init?: RequestInit) {
  const token = await getGoogleAccessToken(userId);
  const res = await fetch(`${PEOPLE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google Contacts error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json();
}

export interface GoogleContactRef {
  resourceName: string;
  etag: string;
}

export async function createGoogleContact(
  userId: string,
  card: CardInput
): Promise<GoogleContactRef> {
  const data = await gfetch(userId, '/people:createContact', {
    method: 'POST',
    body: JSON.stringify(buildPersonBody(card)),
  });
  return { resourceName: data.resourceName, etag: data.etag };
}

export async function updateGoogleContact(
  userId: string,
  resourceName: string,
  card: CardInput
): Promise<GoogleContactRef> {
  // Google requires the current etag; fetch it first.
  const current = await gfetch(
    userId,
    `/${resourceName}?personFields=metadata`
  );
  const fields =
    'names,organizations,phoneNumbers,emailAddresses,urls,addresses,biographies';
  const data = await gfetch(
    userId,
    `/${resourceName}:updateContact?updatePersonFields=${fields}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ ...buildPersonBody(card), etag: current.etag }),
    }
  );
  return { resourceName: data.resourceName, etag: data.etag };
}

export async function deleteGoogleContact(userId: string, resourceName: string): Promise<void> {
  await gfetch(userId, `/${resourceName}:deleteContact`, { method: 'DELETE' });
}

interface GooglePerson {
  resourceName: string;
  names?: { displayName?: string; givenName?: string }[];
  organizations?: { name?: string }[];
  emailAddresses?: { value?: string }[];
  phoneNumbers?: { value?: string }[];
}

function toMatch(p: GooglePerson, matchedOn: ('email' | 'phone')[]): DuplicateMatch {
  return {
    source: 'google',
    resourceName: p.resourceName,
    fullName: p.names?.[0]?.displayName || p.names?.[0]?.givenName || '(no name)',
    company: p.organizations?.[0]?.name,
    emails: (p.emailAddresses || []).map((e) => e.value || '').filter(Boolean),
    phones: (p.phoneNumbers || []).map((e) => e.value || '').filter(Boolean),
    matchedOn,
  };
}

// Search the user's Google Contacts for matches on any provided email/phone.
export async function findGoogleDuplicates(
  userId: string,
  card: CardInput
): Promise<DuplicateMatch[]> {
  const queries = [...card.emails, ...card.mobileNumbers, ...card.officeNumbers]
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, 5);

  const readMask = 'names,organizations,emailAddresses,phoneNumbers';
  const wantedEmails = new Set(card.emails.map(normaliseEmail));
  const wantedPhones = new Set(
    [...card.mobileNumbers, ...card.officeNumbers].map(normalisePhone)
  );

  const byResource = new Map<string, DuplicateMatch>();

  for (const q of queries) {
    try {
      const data = await gfetch(
        userId,
        `/people:searchContacts?query=${encodeURIComponent(q)}&readMask=${readMask}&pageSize=10`
      );
      const results: { person: GooglePerson }[] = data.results || [];
      for (const r of results) {
        const p = r.person;
        const matchedOn: ('email' | 'phone')[] = [];
        if ((p.emailAddresses || []).some((e) => wantedEmails.has(normaliseEmail(e.value || ''))))
          matchedOn.push('email');
        if ((p.phoneNumbers || []).some((e) => wantedPhones.has(normalisePhone(e.value || ''))))
          matchedOn.push('phone');
        if (matchedOn.length) byResource.set(p.resourceName, toMatch(p, matchedOn));
      }
    } catch {
      // Ignore a single failed query; return whatever matched.
    }
  }
  return [...byResource.values()];
}

// Pull connections for re-sync (returns lightweight refs).
export async function listGoogleConnections(userId: string): Promise<GooglePerson[]> {
  const readMask = 'names,organizations,emailAddresses,phoneNumbers';
  const data = await gfetch(
    userId,
    `/people/me/connections?personFields=${readMask}&pageSize=200&sortOrder=LAST_MODIFIED_DESCENDING`
  );
  return (data.connections || []) as GooglePerson[];
}
