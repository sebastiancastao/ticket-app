import { createTicketAction } from "@/lib/actions";

export default function NewTicketPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        New ticket
      </h1>

      <form
        action={createTicketAction}
        className="flex flex-col gap-5 rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-[#0a0a0a]"
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="title" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            placeholder="Describe the problem in a few words"
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="description" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            placeholder="Add as much detail as possible: steps to reproduce, screenshots, etc."
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="priority" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="medium"
            className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/[.145] dark:focus:border-zinc-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <button
          type="submit"
          className="mt-2 self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Create ticket
        </button>
      </form>
    </div>
  );
}
