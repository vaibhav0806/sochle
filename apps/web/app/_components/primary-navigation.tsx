"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home" },
  { href: "/check", label: "Check" },
  { href: "/decisions", label: "Decisions" },
  { href: "/settings", label: "Settings" },
] as const;

const settingsRoutes = ["/connections", "/money-inbox", "/rules", "/settings"];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/today";
  if (href === "/settings") {
    return settingsRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary navigation" className="primary-navigation">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link aria-current={active ? "page" : undefined} href={item.href} key={item.href}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
