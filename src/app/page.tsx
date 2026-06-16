import Link from 'next/link';
import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { SignInButton } from '@/components/sign-in-button';
import { Camera, PencilLine, CheckCircle2, ScanLine } from 'lucide-react';

export default async function LandingPage() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-6 pb-12 pt-10">
      <header className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ScanLine className="size-7" aria-hidden />
        </span>
        <span className="font-display text-2xl font-bold tracking-tight">Card Scanner</span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-display text-[2.5rem] font-extrabold leading-tight tracking-tight text-foreground">
          Scan a card.
          <br />
          <span className="text-primary">Save the contact.</span>
        </h1>
        <p className="mt-5 text-xl leading-relaxed text-muted-foreground">
          Point your phone at a business card. We read the details, you check them, and it saves
          straight to your Google Contacts.
        </p>

        <ol className="mt-10 flex flex-col gap-5">
          {[
            { Icon: Camera, title: 'Snap a photo', desc: 'Use your camera — no typing.' },
            { Icon: PencilLine, title: 'Quick review', desc: 'Check the details we found.' },
            { Icon: CheckCircle2, title: 'Saved everywhere', desc: 'Stored here and in Google.' },
          ].map(({ Icon, title, desc }, i) => (
            <li key={i} className="flex items-center gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-7" aria-hidden />
              </span>
              <span>
                <span className="block text-xl font-semibold text-foreground">{title}</span>
                <span className="block text-lg text-muted-foreground">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </main>

      <footer className="flex flex-col gap-4">
        {signedIn ? (
          <Button asChild size="lg" variant="accent" className="w-full">
            <Link href="/scan">
              <Camera aria-hidden />
              Scan a card
            </Link>
          </Button>
        ) : (
          <SignInButton callbackUrl="/scan" label="Get started with Google" />
        )}
        <p className="text-center text-base text-muted-foreground">
          {signedIn ? (
            <Link href="/contacts" className="font-semibold text-primary underline-offset-4 hover:underline">
              View your contacts
            </Link>
          ) : (
            'We only ask for permission to manage the contacts you save here.'
          )}
        </p>
      </footer>
    </div>
  );
}
