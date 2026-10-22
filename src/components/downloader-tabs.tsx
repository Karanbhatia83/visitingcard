import Link from 'next/link';
import { Instagram, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/reels', label: 'Instagram', Icon: Instagram },
  { href: '/youtube', label: 'YouTube', Icon: Youtube },
] as const;

// Switch between the Instagram and YouTube downloaders.
export function DownloaderTabs({ active }: { active: '/reels' | '/youtube' }) {
  return (
    <nav
      aria-label="Choose a downloader"
      className="mt-6 grid grid-cols-2 gap-1 rounded-xl border-2 border-input bg-muted p-1"
    >
      {TABS.map(({ href, label, Icon }) => {
        const isActive = href === active;
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-lg text-base font-semibold transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
