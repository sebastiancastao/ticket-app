import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ticket App",
  description: "Simple ticket management system",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <header className="border-b border-black/[.08] dark:border-white/[.145]">
          <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              🎫 Ticket App
            </Link>
            <div className="flex items-center gap-6 text-sm font-medium">
              <Link href="/" className="text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
                Tickets
              </Link>
              <Link
                href="/tickets/new"
                className="rounded-full bg-foreground px-4 py-1.5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                New ticket
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
