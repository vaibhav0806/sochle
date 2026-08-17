import { redirect } from "next/navigation";

import { isOwnerAuthenticated } from "../../lib/server/auth";
import { getServerEnv } from "../../lib/server/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isOwnerAuthenticated()) redirect("/connections");
  const serverEnv = getServerEnv();
  const { error } = await searchParams;

  return (
    <main className="narrow">
      <p className="eyebrow">Private workspace</p>
      <h1>Sign in</h1>
      <p>Your financial data is protected by the single-owner password configured on the server.</p>
      {error === "invalid" && <p className="notice error">That password is not correct.</p>}
      {!serverEnv.SOCHLE_DEMO_MODE && (
        <form action="/api/session" method="post" className="stack card">
          <label htmlFor="password">Owner password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit">Continue</button>
        </form>
      )}
    </main>
  );
}
