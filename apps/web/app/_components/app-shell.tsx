import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { PrimaryNavigation } from "./primary-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link aria-label="Sochle home" className="brand" href="/">
          सोचle<span aria-hidden="true">.</span>
        </Link>
        <Suspense fallback={<div aria-hidden="true" className="navigation-fallback" />}>
          <PrimaryNavigation />
        </Suspense>
      </header>
      <div id="main-content">{children}</div>
    </div>
  );
}
