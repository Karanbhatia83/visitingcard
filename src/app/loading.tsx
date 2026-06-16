import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[480px] px-5 pt-8">
      <Skeleton className="h-9 w-40" />
      <div className="mt-6 flex flex-col gap-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
