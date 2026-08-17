import type { DecisionRepository } from "@sochle/db";

export type AuthorizationRevoker = {
  revoke(connectionId: string): Promise<void>;
};

export async function deleteOwnerData(input: {
  connectionId: string;
  decisionRepository: DecisionRepository;
  revoker: AuthorizationRevoker | null;
}): Promise<void> {
  await input.revoker?.revoke(input.connectionId);
  await input.decisionRepository.deleteOwnerData(input.connectionId);
}
