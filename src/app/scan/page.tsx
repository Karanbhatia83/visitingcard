import { requireUserId } from '@/lib/session';
import { AppShell } from '@/components/app-shell';
import { CameraCapture } from '@/components/camera-capture';

export default async function ScanPage() {
  await requireUserId();

  return (
    <AppShell>
      <div className="px-5 pt-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Scan a card</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Take a clear photo of the business card.
        </p>
        <div className="mt-7">
          <CameraCapture />
        </div>
      </div>
    </AppShell>
  );
}
