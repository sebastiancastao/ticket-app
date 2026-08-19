import Link from "next/link";
import { signup } from "@/lib/auth-actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Create account
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-950 underline dark:text-zinc-50">
            Log in
          </Link>
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          {message}
        </p>
      )}

      <form
        action={signup}
        className="flex flex-col gap-5 rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-[#0a0a0a]"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-500"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Minimum 6 characters.</p>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Create account
        </button>
      </form>
    </div>
  );
}
