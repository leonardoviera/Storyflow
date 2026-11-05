import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "StoryFlow",
  description: "100% local video storytelling studio",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Story<span className="text-sky-400">Flow</span>
          </Link>
          <span className="text-xs text-slate-500">local · offline · private</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
