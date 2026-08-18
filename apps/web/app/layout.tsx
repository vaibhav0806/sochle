import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/geist";
import "@fontsource-variable/noto-sans-devanagari";

import "./globals.css";
import { AppShell } from "./_components/app-shell";

export const metadata: Metadata = {
  title: "Sochle",
  description: "Decide before you buy.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
