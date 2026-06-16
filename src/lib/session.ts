import { redirect } from 'next/navigation';
import { auth } from '@/auth';

/** For server components / pages: returns the user id or redirects to sign-in. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return session.user.id;
}

/** For route handlers: returns the user id or null. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
