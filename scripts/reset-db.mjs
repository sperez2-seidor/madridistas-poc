import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const localEnvPath = join(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  const lines = readFileSync(localEnvPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    process.env[key] ??= valueParts.join("=");
  }
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/madridistas";

const TABLES = ["platinum_charges", "platinum_leads", "platinum_customers"];

const client = new Client({ connectionString });
await client.connect();

const { rows } = await client.query(
  `
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any($1)
  `,
  [TABLES],
);
const existing = rows.map((row) => row.table_name);

if (existing.length === 0) {
  console.log("No POC tables found. Run `npm run db:migrate` first.");
} else {
  await client.query(
    `truncate table ${existing.join(", ")} restart identity cascade;`,
  );
  console.log(`Truncated: ${existing.join(", ")}`);
}

await client.end();
