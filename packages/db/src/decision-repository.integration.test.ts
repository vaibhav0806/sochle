import { DEFAULT_RULES } from "@sochle/domain";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSochleDatabase } from "./database";
import { connections, ruleSets } from "./schema";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);

beforeEach(async () => {
  await database.db.delete(connections);
});

afterAll(async () => {
  await database.close();
});

describe("decision schema", () => {
  it("enforces one rule version per connection", async () => {
    const [connection] = await database.db
      .insert(connections)
      .values({ provider: "fold" })
      .returning();
    if (connection === undefined) throw new Error("Expected connection");
    const rules = { ...DEFAULT_RULES, version: 1 };

    await database.db.insert(ruleSets).values({ connectionId: connection.id, rules, version: 1 });

    await expect(
      database.db.insert(ruleSets).values({ connectionId: connection.id, rules, version: 1 })
    ).rejects.toThrow();
  });
});
