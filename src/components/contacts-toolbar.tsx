'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, FileSpreadsheet, FileText, Contact } from 'lucide-react';

const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'recent', label: 'Recently added' },
];
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'SYNCED', label: 'In Google' },
  { value: 'LOCAL_ONLY', label: 'On device' },
  { value: 'FAILED', label: 'Sync failed' },
];

export function ContactsToolbar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const push = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== 'all') sp.set(k, v);
        else sp.delete(k);
      }
      router.push(`/contacts?${sp.toString()}`);
    },
    [params, router]
  );

  useEffect(() => {
    return () => clearTimeout(debounce.current);
  }, []);

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => push({ q: value }), 300);
  }

  const sort = params.get('sort') ?? 'name';
  const filter = params.get('filter') ?? 'all';
  const selectClass =
    'h-14 w-full rounded-lg border-2 border-input bg-background px-4 text-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, company, phone…"
          inputMode="search"
          aria-label="Search contacts"
          className="pl-12"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="sr-only">Sort</span>
          <select
            className={selectClass}
            value={sort}
            onChange={(e) => push({ sort: e.target.value })}
            aria-label="Sort contacts"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="sr-only">Filter</span>
          <select
            className={selectClass}
            value={filter}
            onChange={(e) => push({ filter: e.target.value })}
            aria-label="Filter contacts"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="rounded-lg border-2 border-input">
        <summary className="flex h-14 cursor-pointer items-center gap-2 px-4 text-lg font-semibold">
          <Download className="size-6" aria-hidden />
          Export contacts
        </summary>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <Button asChild variant="outline" className="w-full justify-start">
            <a href="/api/export?format=csv">
              <FileText aria-hidden /> CSV (.csv)
            </a>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <a href="/api/export?format=xlsx">
              <FileSpreadsheet aria-hidden /> Excel (.xlsx)
            </a>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <a href="/api/export?format=vcf">
              <Contact aria-hidden /> vCard (.vcf)
            </a>
          </Button>
        </div>
      </details>
    </div>
  );
}
