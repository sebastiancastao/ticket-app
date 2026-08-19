import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        We couldn&apos;t confirm your access
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        The link has expired or was already used. Try logging in again or
        request a new link.
      </p>
      <Link
        href="/login"
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Back to login
      </Link>
    </div>
  );
}
