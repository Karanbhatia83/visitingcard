import { getUserId } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { toCSV, toXLSX, toVCF, EXPORT_MIME } from '@/lib/export';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return new Response('Please sign in.', { status: 401 });

  const url = new URL(req.url);
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();
  const idsParam = url.searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').filter(Boolean) : undefined;

  const contacts = await prisma.contact.findMany({
    where: { userId, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: { fullName: 'asc' },
  });

  await audit({ userId, action: 'EXPORT', metadata: { format, count: contacts.length } });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `contacts-${stamp}.${format}`;

  if (format === 'xlsx') {
    const buf = await toXLSX(contacts);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': EXPORT_MIME.xlsx,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }
  if (format === 'vcf') {
    return new Response(toVCF(contacts), {
      headers: {
        'Content-Type': EXPORT_MIME.vcf,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }
  return new Response(toCSV(contacts), {
    headers: {
      'Content-Type': EXPORT_MIME.csv,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
