import { createServer } from "node:http";

import { foldCoreResponses } from "@sochle/fixtures";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FoldOAuthProvider } from "./oauth-provider";
import type { FoldOAuthState } from "./oauth-provider";
import { FoldMcpSession } from "./transport";

let endpoint = "";
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    if (chunks.length === 0) {
      response.writeHead(200).end();
      return;
    }
    const message = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      id?: number;
      method: string;
    };
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }

    const result =
      message.method === "initialize"
        ? {
            capabilities: { tools: {} },
            protocolVersion: "2025-11-25",
            serverInfo: { name: "synthetic-fold", version: "1.0.0" },
          }
        : {
            content: [],
            structuredContent: foldCoreResponses.totalBalance,
          };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: message.id, jsonrpc: "2.0", result }));
  });
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server did not bind");
  endpoint = `http://127.0.0.1:${address.port}/mcp`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  );
});

describe("FoldMcpSession", () => {
  it("connects over the real Streamable HTTP transport and calls a Fold tool", async () => {
    let state: FoldOAuthState | null = null;
    const oauth = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store: {
        async load() {
          return state;
        },
        async save(next) {
          state = next;
        },
      },
    });
    const session = new FoldMcpSession(endpoint, oauth);

    try {
      await session.connect();
      await expect(session.gateway.getTotalBalance()).resolves.toMatchObject({
        currency: "INR",
        total: 250000.25,
      });
    } finally {
      await session.close();
    }
  });
});
