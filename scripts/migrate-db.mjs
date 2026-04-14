import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:54322/madridistas";

const client = new Client({ connectionString });
const schema = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");

await client.connect();
await client.query(schema);
await client.end();

console.log("Database schema is ready.");
