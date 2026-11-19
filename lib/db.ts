import { Pool, type PoolClient } from "pg";

const globalStore = globalThis as typeof globalThis & { scoutrolesPool?: Pool };

export function getPool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!globalStore.scoutrolesPool) globalStore.scoutrolesPool = new Pool({ connectionString: url });
  return globalStore.scoutrolesPool;
}

let schema: Promise<void> | null = null;

export function ready(): Promise<void> {
  if (!schema) {
    schema = ensure().catch((error: unknown) => {
      schema = null;
      throw error;
    });
  }
  return schema;
}

export async function withTx<T>(task: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function connect(): Promise<PoolClient> {
  let last: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw last;
}

async function ensure() {
  const client = await connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS passes (
        id uuid PRIMARY KEY,
        token text NOT NULL UNIQUE,
        email text NOT NULL,
        stripe_session_id text NOT NULL UNIQUE,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        letters_used integer NOT NULL,
        letter_quota integer NOT NULL,
        password_hash text,
        password_salt text,
        provider text,
        google_sub text,
        microsoft_sub text,
        apple_sub text,
        github_sub text
      );
      CREATE INDEX IF NOT EXISTS passes_email_idx ON passes (email);
      CREATE UNIQUE INDEX IF NOT EXISTS passes_google_sub_key ON passes (google_sub) WHERE google_sub IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS passes_microsoft_sub_key ON passes (microsoft_sub) WHERE microsoft_sub IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS passes_apple_sub_key ON passes (apple_sub) WHERE apple_sub IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS passes_github_sub_key ON passes (github_sub) WHERE github_sub IS NOT NULL;
      CREATE TABLE IF NOT EXISTS trackers (
        pass_id uuid PRIMARY KEY REFERENCES passes (id) ON DELETE CASCADE,
        data jsonb NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profiles (
        pass_id uuid PRIMARY KEY REFERENCES passes (id) ON DELETE CASCADE,
        data jsonb NOT NULL
      );
    `);
  } finally {
    client.release();
  }
}
