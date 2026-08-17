import { randomBytes } from "node:crypto";

import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from "@modelcontextprotocol/client";

export type FoldOAuthState = {
  clientInformationByIssuer: Record<string, StoredOAuthClientInformation>;
  codeVerifier: string | null;
  latestIssuer: string | null;
  oauthState: string | null;
  tokensByIssuer: Record<string, StoredOAuthTokens>;
};

export type FoldOAuthStateStore = {
  load(): Promise<FoldOAuthState | null>;
  save(state: FoldOAuthState): Promise<void>;
};

type FoldOAuthProviderOptions = {
  onRedirect(url: URL): void | Promise<void>;
  redirectUrl: string;
  store: FoldOAuthStateStore;
};

const emptyState = (): FoldOAuthState => ({
  clientInformationByIssuer: {},
  codeVerifier: null,
  latestIssuer: null,
  oauthState: null,
  tokensByIssuer: {},
});

function firstValue<T>(values: Record<string, T>): T | undefined {
  return Object.values(values)[0];
}

export class FoldOAuthProvider implements OAuthClientProvider {
  readonly redirectUrl: string;
  readonly clientMetadata: OAuthClientMetadata;

  constructor(private readonly options: FoldOAuthProviderOptions) {
    this.redirectUrl = options.redirectUrl;
    this.clientMetadata = {
      client_name: "Sochle",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [options.redirectUrl],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  private async load(): Promise<FoldOAuthState> {
    return (await this.options.store.load()) ?? emptyState();
  }

  async state(): Promise<string> {
    const state = await this.load();
    const oauthState = randomBytes(32).toString("base64url");
    await this.options.store.save({ ...state, oauthState });
    return oauthState;
  }

  async consumeState(receivedState: string | null): Promise<void> {
    const state = await this.load();
    if (state.oauthState === null || receivedState !== state.oauthState) {
      throw new Error("OAuth state mismatch");
    }
    await this.options.store.save({ ...state, oauthState: null });
  }

  async clientInformation(ctx?: OAuthClientInformationContext) {
    const state = await this.load();
    if (ctx !== undefined) return state.clientInformationByIssuer[ctx.issuer];
    if (state.latestIssuer !== null) {
      return state.clientInformationByIssuer[state.latestIssuer];
    }
    return firstValue(state.clientInformationByIssuer);
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    ctx?: OAuthClientInformationContext
  ): Promise<void> {
    if (ctx === undefined) throw new Error("OAuth issuer is required to save client information");
    const state = await this.load();
    await this.options.store.save({
      ...state,
      clientInformationByIssuer: {
        ...state.clientInformationByIssuer,
        [ctx.issuer]: clientInformation,
      },
      latestIssuer: ctx.issuer,
    });
  }

  async tokens(ctx?: OAuthClientInformationContext) {
    const state = await this.load();
    if (ctx !== undefined) return state.tokensByIssuer[ctx.issuer];
    if (state.latestIssuer !== null) return state.tokensByIssuer[state.latestIssuer];
    return firstValue(state.tokensByIssuer);
  }

  async saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext): Promise<void> {
    if (ctx === undefined) throw new Error("OAuth issuer is required to save tokens");
    const state = await this.load();
    await this.options.store.save({
      ...state,
      latestIssuer: ctx.issuer,
      tokensByIssuer: { ...state.tokensByIssuer, [ctx.issuer]: tokens },
    });
  }

  redirectToAuthorization(authorizationUrl: URL): void | Promise<void> {
    return this.options.onRedirect(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const state = await this.load();
    await this.options.store.save({ ...state, codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const state = await this.load();
    if (state.codeVerifier === null) throw new Error("OAuth code verifier is missing");
    return state.codeVerifier;
  }
}
