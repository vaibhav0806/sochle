import {
  extensionDecisionCardSchema,
  extensionErrorSchema,
  extensionSessionSchema,
  productDecisionRequestSchema,
  purchaseOutcomeSchema,
  type ProductDecisionRequest,
  type PurchaseOutcome,
} from "@sochle/contracts/browser";

export type CredentialStore = {
  get(): Promise<string | null>;
  remove(): Promise<void>;
  set(value: string): Promise<void>;
};

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function parseOutcomeResponse(input: unknown): { status: PurchaseOutcome } {
  if (typeof input !== "object" || input === null || Object.keys(input).length !== 1) {
    throw new Error("Invalid outcome response");
  }
  return { status: purchaseOutcomeSchema.parse(Reflect.get(input, "status")) };
}

export function createApiClient(options: {
  apiOrigin: string;
  credential: CredentialStore;
  extensionOrigin?: string;
  fetch: FetchLike;
}) {
  async function fetchWithCredential(path: string, init: RequestInit, rawCredential: string) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${rawCredential}`);
    if (options.extensionOrigin !== undefined) headers.set("Origin", options.extensionOrigin);
    return options.fetch(new URL(path, options.apiOrigin), { ...init, headers });
  }

  async function authenticated(path: string, init: RequestInit) {
    const rawCredential = await options.credential.get();
    if (rawCredential === null) throw new Error("Extension is not paired");
    const response = await fetchWithCredential(path, init, rawCredential);
    if (response.status === 401) await options.credential.remove();
    return response;
  }

  async function requireOk(response: Response) {
    if (response.ok) return;
    const error = extensionErrorSchema.safeParse(await response.json().catch(() => null));
    throw new Error(error.success ? error.data.error.message : "Sochle request failed");
  }

  return {
    async createDecision(product: ProductDecisionRequest) {
      const body = productDecisionRequestSchema.parse(product);
      const response = await authenticated("/api/extension/decisions", {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      await requireOk(response);
      return extensionDecisionCardSchema.parse(await response.json());
    },

    async disconnect() {
      const response = await authenticated("/api/extension/session", { method: "DELETE" });
      await requireOk(response);
      await options.credential.remove();
      return { disconnected: true as const };
    },

    async getSession() {
      const rawCredential = await options.credential.get();
      if (rawCredential === null) {
        return extensionSessionSchema.parse({ appUrl: options.apiOrigin, kind: "unpaired" });
      }
      const response = await fetchWithCredential(
        "/api/extension/session",
        { method: "GET" },
        rawCredential
      );
      if (response.status === 401) await options.credential.remove();
      return extensionSessionSchema.parse(await response.json());
    },

    async setOutcome(intentId: string, outcome: PurchaseOutcome) {
      const response = await authenticated(`/api/extension/purchase-intents/${intentId}`, {
        body: JSON.stringify({ outcome: purchaseOutcomeSchema.parse(outcome) }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      await requireOk(response);
      return parseOutcomeResponse(await response.json());
    },

    async verifyCredential(rawCredential: string) {
      const response = await fetchWithCredential(
        "/api/extension/session",
        { method: "GET" },
        rawCredential
      );
      const session = extensionSessionSchema.parse(await response.json());
      if (!response.ok || session.kind !== "paired") throw new Error("Pairing verification failed");
      return session;
    },
  };
}
