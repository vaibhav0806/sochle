import { createOwnerSession, verifyOwnerPassword } from "@sochle/contracts";
import { NextResponse } from "next/server";

import { ownerSessionCookie } from "../../../lib/server/auth";
import { getServerEnv } from "../../../lib/server/env";

export async function POST(request: Request) {
  const serverEnv = getServerEnv();
  const form = await request.formData();
  const password = form.get("password");
  if (
    typeof password !== "string" ||
    serverEnv.SOCHLE_OWNER_PASSWORD === undefined ||
    serverEnv.SOCHLE_SESSION_SECRET === undefined ||
    !verifyOwnerPassword(password, serverEnv.SOCHLE_OWNER_PASSWORD)
  ) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/connections", request.url), 303);
  response.cookies.set(
    ownerSessionCookie,
    createOwnerSession(serverEnv.SOCHLE_SESSION_SECRET, new Date(), 12 * 60 * 60),
    {
      httpOnly: true,
      maxAge: 12 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: new URL(serverEnv.SOCHLE_APP_URL).protocol === "https:",
    }
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete(ownerSessionCookie);
  return response;
}
