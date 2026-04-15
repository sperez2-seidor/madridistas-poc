import { Pool } from "pg";

declare global {
  var platinumLeadPool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL && process.env.VERCEL === "1") {
    throw new Error("DATABASE_URL no está configurada en Vercel.");
  }

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
