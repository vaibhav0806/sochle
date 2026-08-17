import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sochle",
  description: "Decide before you buy.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header>
          <Link className="brand" href="/">
            सोचle.
          </Link>
          <nav>
            <Link href="/today">Today</Link>
            <Link href="/check">Check</Link>
            <Link href="/rules">Rules</Link>
            <Link href="/decisions">Decisions</Link>
            <Link href="/connections">Data</Link>
            <Link href="/money-inbox">Money Inbox</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
