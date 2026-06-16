'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ScanLine, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/scan', label: 'Scan', icon: ScanLine, primary: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-safe"
    >
      <ul className="mx-auto flex max-w-[480px] items-stretch justify-around">
        {items.map((item) => {
          const active =
            item.href === '/contacts'
              ? pathname.startsWith('/contacts')
              : pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          if (item.primary) {
            return (
              <li key={item.href} className="flex flex-1 items-center justify-center">
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className="-mt-6 flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 ring-4 ring-background transition-transform active:scale-95"
                >
                  <Icon className="size-8" aria-hidden />
                  <span className="text-sm font-bold">{item.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-20 flex-col items-center justify-center gap-1 text-base font-semibold transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-7" aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
