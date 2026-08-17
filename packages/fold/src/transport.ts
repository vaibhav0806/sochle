import {
  Client,
  StreamableHTTPClientTransport,
  type OAuthClientProvider,
} from "@modelcontextprotocol/client";

import { FoldGateway } from "./client";

export class FoldMcpSession {
  readonly gateway: FoldGateway;
  private readonly client = new Client({ name: "sochle", version: "0.1.0" });
  private readonly transport: StreamableHTTPClientTransport;

  constructor(url: string, authProvider: OAuthClientProvider) {
    this.transport = new StreamableHTTPClientTransport(new URL(url), { authProvider });
    this.gateway = new FoldGateway({
      callTool: (request) => this.client.callTool(request),
    });
  }

  connect(): Promise<void> {
    return this.client.connect(this.transport);
  }

  finishAuth(callbackParams: URLSearchParams): Promise<void> {
    return this.transport.finishAuth(callbackParams);
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
