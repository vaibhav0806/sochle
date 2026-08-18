import Link from "next/link";

import { requireOwnerPage } from "../../lib/server/auth";

const sections = [
  {
    description: "The commitments and cushion every purchase should respect.",
    href: "/rules",
    title: "My guardrails",
  },
  {
    description: "Keep your account ready and manage approved browsers.",
    href: "/connections",
    title: "Connected account and browser",
  },
  {
    description: "Download your information or remove it from Sochle.",
    href: "/settings/privacy",
    title: "Privacy and data",
  },
  {
    description: "See the behind-the-scenes details Sochle uses only when you need them.",
    href: "/settings/technical",
    title: "Technical details",
  },
] as const;

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireOwnerPage();
  return (
    <main>
      <p className="eyebrow">Make Sochle yours</p>
      <h1>Settings</h1>
      <p>Choose what Sochle protects and manage the private connections behind it.</p>
      <div className="settings-list">
        {sections.map((section) => (
          <Link className="settings-row" href={section.href} key={section.href} prefetch={false}>
            <span>
              <strong>{section.title}</strong>
              <small>{section.description}</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
