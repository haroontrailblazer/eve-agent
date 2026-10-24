import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_TABLES } from "@/lib/db/client";

const MIGRATIONS_DIR = join(process.cwd(), "lib", "db", "migrations");

// The harpy-v2 migrations start at 0006. The deploy runs the new build first
// and migrates right after, so the build must refuse to run until all of them
// have been applied (docs/setup-and-deploy.md).
const FIRST_HARPY_V2_MIGRATION = 6;

function tablesCreatedFrom(firstMigration: number): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{4}_.*\.sql$/.test(file))
    .filter((file) => Number(file.slice(0, 4)) >= firstMigration)
    .flatMap((file) =>
      [...readFileSync(join(MIGRATIONS_DIR, file), "utf8").matchAll(/CREATE TABLE "([^"]+)"/g)].map(
        (match) => match[1]!,
      ),
    );
}

describe("REQUIRED_TABLES", () => {
  it("gates on every table the harpy-v2 migrations create", () => {
    const created = tablesCreatedFrom(FIRST_HARPY_V2_MIGRATION);

    expect(created).toContain("media_asset");
    expect([...REQUIRED_TABLES]).toEqual(expect.arrayContaining(created));
  });

  it("includes the tables chat cannot run without", () => {
    expect(REQUIRED_TABLES).toEqual(expect.arrayContaining(["chat", "chat_event", "user"]));
  });
});
