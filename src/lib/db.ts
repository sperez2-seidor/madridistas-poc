import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var platinumLeadPool: Pool | undefined;
}

export function getPool() {
  if (!globalThis.platinumLeadPool) {
    globalThis.platinumLeadPool = new Pool({
      connectionString:
        process.env.DATABASE_URL ??
        "postgres://postgres:postgres@localhost:54322/madridistas",
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  return globalThis.platinumLeadPool;
}
