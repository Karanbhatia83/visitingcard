import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInButton } from '@/components/sign-in-button';
import { ScanLine, ShieldCheck } from 'lucide-react';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await auth();
  if (session?.user?.id) redirect(searchParams.callbackUrl || '/scan');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-6 py-12">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground">
          <ScanLine className="size-9" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">Welcome</h1>
        <p className="mt-3 text-xl text-muted-foreground">
          Sign in to start scanning cards and saving contacts.
        </p>
      </div>

      <div className="mt-10">
        <SignInButton callbackUrl={searchParams.callbackUrl || '/scan'} />
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-muted/60 p-5 text-left">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
        <p className="text-base leading-relaxed text-muted-foreground">
          We use your Google sign-in only to save and update the contacts you create here. You can
          turn Google syncing off anytime in Settings.
        </p>
      </div>

      <p className="mt-10 text-center text-base text-muted-foreground">
        <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}
