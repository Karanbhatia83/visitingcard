import ExcelJS from 'exceljs';
import { toStringArray } from '@/lib/utils';

// A minimal shape that matches Prisma's Contact for export purposes.
export interface ExportContact {
  fullName: string;
  company: string | null;
  designation: string | null;
  mobileNumbers: unknown;
  officeNumbers: unknown;
  emails: unknown;
  website: string | null;
  linkedin: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
}

const COLUMNS = [
  'Full Name',
  'Company',
  'Designation',
  'Mobile Numbers',
  'Office Numbers',
  'Emails',
  'Website',
  'LinkedIn',
  'Address',
  'Notes',
  'Saved On',
];

function row(c: ExportContact): (string | Date)[] {
  return [
    c.fullName,
    c.company ?? '',
    c.designation ?? '',
    toStringArray(c.mobileNumbers).join(' | '),
    toStringArray(c.officeNumbers).join(' | '),
    toStringArray(c.emails).join(' | '),
    c.website ?? '',
    c.linkedin ?? '',
    c.address ?? '',
    c.notes ?? '',
    c.createdAt,
  ];
}

function csvCell(v: string | Date): string {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(contacts: ExportContact[]): string {
  const lines = [COLUMNS.join(',')];
  for (const c of contacts) lines.push(row(c).map(csvCell).join(','));
  return lines.join('\n');
}

export async function toXLSX(contacts: ExportContact[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contacts');
  ws.addRow(COLUMNS);
  ws.getRow(1).font = { bold: true };
  ws.columns = COLUMNS.map((c) => ({ width: Math.max(16, c.length + 4) }));
  for (const c of contacts) ws.addRow(row(c));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function vcardEscape(s: string): string {
  return (s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

export function toVCF(contacts: ExportContact[]): string {
  return contacts
    .map((c) => {
      const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      lines.push(`FN:${vcardEscape(c.fullName)}`);
      lines.push(`N:${vcardEscape(c.fullName)};;;;`);
      if (c.company || c.designation) {
        lines.push(`ORG:${vcardEscape(c.company ?? '')}`);
        if (c.designation) lines.push(`TITLE:${vcardEscape(c.designation)}`);
      }
      for (const m of toStringArray(c.mobileNumbers)) lines.push(`TEL;TYPE=CELL:${m}`);
      for (const o of toStringArray(c.officeNumbers)) lines.push(`TEL;TYPE=WORK:${o}`);
      for (const e of toStringArray(c.emails)) lines.push(`EMAIL;TYPE=INTERNET:${e}`);
      if (c.website) lines.push(`URL:${vcardEscape(c.website)}`);
      if (c.linkedin) lines.push(`URL;TYPE=linkedin:${vcardEscape(c.linkedin)}`);
      if (c.address) lines.push(`ADR;TYPE=WORK:;;${vcardEscape(c.address)};;;;`);
      if (c.notes) lines.push(`NOTE:${vcardEscape(c.notes)}`);
      lines.push('END:VCARD');
      return lines.join('\r\n');
    })
    .join('\r\n');
}

export const EXPORT_MIME = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  vcf: 'text/vcard;charset=utf-8',
} as const;
