import { customType, pgEnum } from "drizzle-orm/pg-core";

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const connectionStatus = pgEnum("connection_status", [
  "disconnected",
  "authorizing",
  "connected",
  "error",
]);
export const accountStatus = pgEnum("account_status", ["active", "pending", "excluded"]);
export const accountType = pgEnum("account_type", ["bank", "credit_card"]);
export const transactionDirection = pgEnum("transaction_direction", ["credit", "debit"]);
export const cashFlowInclusion = pgEnum("cash_flow_inclusion", ["included", "excluded"]);
export const dataConfidence = pgEnum("data_confidence", ["high", "medium", "low"]);
export const transactionClassification = pgEnum("transaction_classification", [
  "consumption",
  "investment",
  "transfer",
  "credit_card_payment",
  "refund",
  "lending",
  "income",
  "unclassified",
]);
export const issueSeverity = pgEnum("issue_severity", ["info", "warning", "blocking"]);
export const issueStatus = pgEnum("issue_status", ["open", "resolved", "ignored"]);
export const correctionAction = pgEnum("correction_action", ["classify", "exclude", "ignore_once"]);
export const syncStatus = pgEnum("sync_status", ["running", "succeeded", "failed"]);
