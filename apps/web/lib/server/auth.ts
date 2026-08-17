import "server-only";

import { verifyOwnerSession } from "@sochle/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerEnv } from "./env";

export const ownerSessionCookie = "sochle_owner";

export async function isOwnerAuthenticated(): Promise<boolean> {
  const serverEnv = getServerEnv();
  if (serverEnv.SOCHLE_DEMO_MODE) return true;
  if (serverEnv.SOCHLE_SESSION_SECRET === undefined) return false;
  const token = (await cookies()).get(ownerSessionCookie)?.value;
  return (
    token !== undefined && verifyOwnerSession(token, serverEnv.SOCHLE_SESSION_SECRET, new Date())
  );
}

export async function requireOwnerPage(): Promise<void> {
  if (!(await isOwnerAuthenticated())) redirect("/login");
}
