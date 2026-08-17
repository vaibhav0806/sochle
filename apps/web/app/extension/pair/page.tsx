import Link from "next/link";

import { requireOwnerPage } from "../../../lib/server/auth";
import { getExtensionRuntime } from "../../../lib/server/extension-runtime";

export const dynamic = "force-dynamic";

export default async function ExtensionPairPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requireOwnerPage();
  const requestId = (await searchParams).request;
  const runtime = getExtensionRuntime();
  let approval: Awaited<
    ReturnType<NonNullable<typeof runtime>["service"]["getApprovalContext"]>
  > | null = null;
  if (runtime !== null && requestId !== undefined) {
    try {
      approval = await runtime.service.getApprovalContext(requestId);
    } catch {
      approval = null;
    }
  }

  return (
    <main>
      <p className="eyebrow">Sochle extension</p>
      <h1>Pair this browser?</h1>
      {approval === null ? (
        <section className="card stack">
          <h2>This pairing link is invalid or expired</h2>
          <p className="muted">Return to the extension and start pairing again.</p>
          <p>
            <Link href="/connections">Review connected browsers →</Link>
          </p>
        </section>
      ) : (
        <section className="card stack">
          <h2>Approve one-time pairing</h2>
          <p>
            Browser origin: <code>{approval.extensionOrigin}</code>
          </p>
          <p className="muted">
            This request expires at{" "}
            {new Date(approval.expiresAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
            .
          </p>
          <p>
            The extension can request purchase decisions. It cannot read your Fold credentials or
            financial snapshot directly.
          </p>
          <form
            action={`/api/extension/pairing-requests/${approval.requestId}/approve`}
            method="post"
          >
            <input name="csrfToken" type="hidden" value={approval.csrfToken} />
            <button type="submit">Pair this browser</button>
          </form>
        </section>
      )}
    </main>
  );
}
