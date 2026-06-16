import { BottomNav } from '@/components/bottom-nav';

/**
 * Page wrapper for authenticated screens: constrains width for one-handed
 * mobile use and reserves space for the fixed bottom navigation.
 */
export function AppShell({
  children,
  hideNav = false,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <main className={hideNav ? 'flex-1' : 'flex-1 pb-28'}>{children}</main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
