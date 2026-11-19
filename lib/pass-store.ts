import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import { getPool, ready, withTx } from "@/lib/db";
import { PASS_DAYS, PASS_LETTER_QUOTA, type OAuthProvider } from "@/lib/pass";
import { emptyProfile, type Profile, type Tracked } from "@/lib/types";

export type PassRecord = {
  id: string;
  token: string;
  email: string;
  stripeSessionId: string;
  createdAt: string;
  expiresAt: string;
  lettersUsed: number;
  letterQuota: number;
  passwordHash?: string;
  passwordSalt?: string;
  provider?: OAuthProvider;
  googleSub?: string;
  microsoftSub?: string;
  appleSub?: string;
  githubSub?: string;
};

type PassRow = {
  id: string;
  token: string;
  email: string;
  stripe_session_id: string;
  created_at: Date | string;
  expires_at: Date | string;
  letters_used: number;
  letter_quota: number;
  password_hash: string | null;
  password_salt: string | null;
  provider: string | null;
  google_sub: string | null;
  microsoft_sub: string | null;
  apple_sub: string | null;
  github_sub: string | null;
};

const PASS_COLUMNS =
  "id, token, email, stripe_session_id, created_at, expires_at, letters_used, letter_quota, password_hash, password_salt, provider, google_sub, microsoft_sub, apple_sub, github_sub";

const subColumn = {
  google: "google_sub",
  microsoft: "microsoft_sub",
  apple: "apple_sub",
  github: "github_sub",
} as const;

const subjectField = {
  google: "googleSub",
  microsoft: "microsoftSub",
  apple: "appleSub",
  github: "githubSub",
} as const;

const providerName = {
  google: "Google",
  microsoft: "Microsoft",
  apple: "Apple",
  github: "GitHub",
} as const;

const scryptAsync = promisify(scrypt);
const uuidPattern = /^[0-9a-f-]{36}$/i;

export class PassAuthError extends Error {
  status: number;
  signIn?: string;

  constructor(message: string, status = 401, signIn?: string) {
    super(message);
    this.status = status;
    this.signIn = signIn;
  }
}

function passwordOk(password: string): string {
  const value = password.trim();
  if (value.length < 8 || value.length > 200) {
    throw new PassAuthError("Use a password of at least 8 characters.", 400);
  }
  return value;
}

async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scryptAsync(password, salt, 32)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

async function passwordMatches(password: string, pass: PassRecord): Promise<boolean> {
  if (!pass.passwordHash || !pass.passwordSalt) return false;
  const derived = (await scryptAsync(password, pass.passwordSalt, 32)) as Buffer;
  const expected = Buffer.from(pass.passwordHash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function active(pass: PassRecord): boolean {
  return Boolean(pass.id);
}

function providerOf(value: string | null): OAuthProvider | undefined {
  if (value === "google" || value === "microsoft" || value === "apple" || value === "github") return value;
  return undefined;
}

function passFromRow(row: PassRow): PassRecord {
  const provider = providerOf(row.provider);
  return {
    id: row.id,
    token: row.token,
    email: row.email,
    stripeSessionId: row.stripe_session_id,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    lettersUsed: row.letters_used,
    letterQuota: row.letter_quota,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.password_salt ? { passwordSalt: row.password_salt } : {}),
    ...(provider ? { provider } : {}),
    ...(row.google_sub ? { googleSub: row.google_sub } : {}),
    ...(row.microsoft_sub ? { microsoftSub: row.microsoft_sub } : {}),
    ...(row.apple_sub ? { appleSub: row.apple_sub } : {}),
    ...(row.github_sub ? { githubSub: row.github_sub } : {}),
  };
}

function isUnique(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function assertId(id: string) {
  if (!uuidPattern.test(id)) throw new Error("Invalid pass.");
}

async function one(client: PoolClient, sql: string, values: unknown[]): Promise<PassRecord | null> {
  const result = await client.query<PassRow>(sql, values);
  return result.rows[0] ? passFromRow(result.rows[0]) : null;
}

async function insertPass(client: PoolClient, pass: PassRecord): Promise<PassRecord> {
  const result = await client.query<PassRow>(
    `INSERT INTO passes (
      id, token, email, stripe_session_id, created_at, expires_at, letters_used, letter_quota,
      password_hash, password_salt, provider, google_sub, microsoft_sub, apple_sub, github_sub
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING ${PASS_COLUMNS}`,
    [
      pass.id,
      pass.token,
      pass.email,
      pass.stripeSessionId,
      pass.createdAt,
      pass.expiresAt,
      pass.lettersUsed,
      pass.letterQuota,
      pass.passwordHash ?? null,
      pass.passwordSalt ?? null,
      pass.provider ?? null,
      pass.googleSub ?? null,
      pass.microsoftSub ?? null,
      pass.appleSub ?? null,
      pass.githubSub ?? null,
    ],
  );
  return passFromRow(result.rows[0]);
}

function store<T>(task: (client: PoolClient) => Promise<T>): Promise<T> {
  return ready().then(() => withTx(task));
}

export function findPass(token: string | undefined): Promise<PassRecord | null> {
  if (!token) return Promise.resolve(null);
  return ready().then(async () => {
    const result = await getPool().query<PassRow>(`SELECT ${PASS_COLUMNS} FROM passes WHERE token = $1`, [token]);
    return result.rows[0] ? passFromRow(result.rows[0]) : null;
  });
}

export function passIsActive(pass: PassRecord | null): pass is PassRecord {
  return Boolean(pass && active(pass));
}

export function ensurePass(stripeSessionId: string, email: string): Promise<PassRecord> {
  return store(async (client) => {
    const existing = await one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE stripe_session_id = $1 FOR UPDATE`, [stripeSessionId]);
    if (existing) return existing;
    const created = new Date();
    const pass: PassRecord = {
      id: randomUUID(),
      token: randomBytes(32).toString("hex"),
      email: email.trim().toLowerCase(),
      stripeSessionId,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + PASS_DAYS * 86_400_000).toISOString(),
      lettersUsed: 0,
      letterQuota: PASS_LETTER_QUOTA,
    };
    try {
      return await insertPass(client, pass);
    } catch (error) {
      if (!isUnique(error)) throw error;
      const again = await one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE stripe_session_id = $1`, [stripeSessionId]);
      if (again) return again;
      throw error;
    }
  });
}

// One free account per email. The password is required to open it again.
export function startFreePass(email: string, password: string, create = true): Promise<PassRecord> {
  const normalized = email.trim().toLowerCase();
  const secret = passwordOk(password);
  return store(async (client) => {
    const existing = await one(
      client,
      `SELECT ${PASS_COLUMNS} FROM passes WHERE email = $1 ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
      [normalized],
    );
    if (existing?.passwordHash) {
      if (!(await passwordMatches(secret, existing))) {
        throw new PassAuthError("That password does not match this account.");
      }
      return existing;
    }
    if (existing) {
      const locked = await hashPassword(secret);
      const updated = await one(
        client,
        `UPDATE passes SET password_hash = $2, password_salt = $3 WHERE id = $1 RETURNING ${PASS_COLUMNS}`,
        [existing.id, locked.hash, locked.salt],
      );
      if (!updated) throw new PassAuthError("No account uses that email.", 404);
      return updated;
    }
    if (!create) throw new PassAuthError("No account uses that email.", 404);
    const created = new Date();
    const locked = await hashPassword(secret);
    return insertPass(client, {
      id: randomUUID(),
      token: randomBytes(32).toString("hex"),
      email: normalized,
      stripeSessionId: `free:${randomUUID()}`,
      createdAt: created.toISOString(),
      expiresAt: new Date(created.getTime() + PASS_DAYS * 86_400_000).toISOString(),
      lettersUsed: 0,
      letterQuota: PASS_LETTER_QUOTA,
      passwordHash: locked.hash,
      passwordSalt: locked.salt,
    });
  });
}

// Opens the account that provider just confirmed. The same provider subject returns the same account.
export function startOAuthPass(provider: OAuthProvider, email: string, subject: string): Promise<PassRecord> {
  const normalized = email.trim().toLowerCase();
  const sub = subject.trim();
  const field = subjectField[provider];
  const column = subColumn[provider];
  if (!sub) throw new PassAuthError(`${providerName[provider]} did not confirm this account.`);
  return store(async (client) => {
    const bySub = await one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE ${column} = $1 FOR UPDATE`, [sub]);
    if (bySub) {
      let nextEmail = bySub.email;
      if (normalized && bySub.email !== normalized) {
        const taken = await client.query("SELECT id FROM passes WHERE email = $1 AND id <> $2 LIMIT 1", [normalized, bySub.id]);
        if (!taken.rowCount) nextEmail = normalized;
      }
      const updated = await one(
        client,
        `UPDATE passes SET provider = $2, email = $3 WHERE id = $1 RETURNING ${PASS_COLUMNS}`,
        [bySub.id, provider, nextEmail],
      );
      if (!updated) throw new PassAuthError(`${providerName[provider]} did not confirm this account.`);
      return updated;
    }
    if (!normalized) throw new PassAuthError(`${providerName[provider]} did not share an email for this account.`);
    const existing = await one(
      client,
      `SELECT ${PASS_COLUMNS} FROM passes WHERE email = $1 ORDER BY expires_at DESC LIMIT 1 FOR UPDATE`,
      [normalized],
    );
    if (existing) {
      if (existing[field] && existing[field] !== sub) {
        throw new PassAuthError(`This email is already linked to a different ${providerName[provider]} account.`);
      }
      const updated = await one(
        client,
        `UPDATE passes SET
          provider = $2,
          google_sub = CASE WHEN $3 = 'google' THEN $4 ELSE google_sub END,
          microsoft_sub = CASE WHEN $3 = 'microsoft' THEN $4 ELSE microsoft_sub END,
          apple_sub = CASE WHEN $3 = 'apple' THEN $4 ELSE apple_sub END,
          github_sub = CASE WHEN $3 = 'github' THEN $4 ELSE github_sub END
        WHERE id = $1
        RETURNING ${PASS_COLUMNS}`,
        [existing.id, provider, provider, sub],
      );
      if (!updated) throw new PassAuthError(`${providerName[provider]} did not confirm this account.`);
      return updated;
    }
    const created = new Date();
    try {
      return await insertPass(client, {
        id: randomUUID(),
        token: randomBytes(32).toString("hex"),
        email: normalized,
        stripeSessionId: `free:${randomUUID()}`,
        createdAt: created.toISOString(),
        expiresAt: new Date(created.getTime() + PASS_DAYS * 86_400_000).toISOString(),
        lettersUsed: 0,
        letterQuota: PASS_LETTER_QUOTA,
        provider,
        [field]: sub,
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
      const again = await one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE ${column} = $1`, [sub]);
      if (again) return again;
      throw error;
    }
  });
}

export function setPassPassword(token: string, password: string): Promise<PassRecord> {
  const secret = passwordOk(password);
  return store(async (client) => {
    const pass = await one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE token = $1 FOR UPDATE`, [token]);
    if (!pass || !active(pass)) throw new PassAuthError("Sign in before setting a password.");
    if (pass.passwordHash) throw new PassAuthError("This account already has a password.");
    const locked = await hashPassword(secret);
    const updated = await one(
      client,
      `UPDATE passes SET password_hash = $2, password_salt = $3 WHERE id = $1 RETURNING ${PASS_COLUMNS}`,
      [pass.id, locked.hash, locked.salt],
    );
    if (!updated) throw new PassAuthError("Sign in before setting a password.");
    return updated;
  });
}

export function findPassByEmail(email: string): Promise<PassRecord | null> {
  const normalized = email.trim().toLowerCase();
  return store((client) =>
    one(client, `SELECT ${PASS_COLUMNS} FROM passes WHERE email = $1 ORDER BY expires_at DESC LIMIT 1`, [normalized]),
  );
}

export function consumeLetter(token: string): Promise<PassRecord> {
  return ready().then(async () => {
    const result = await getPool().query<PassRow>(`SELECT ${PASS_COLUMNS} FROM passes WHERE token = $1`, [token]);
    const pass = result.rows[0] ? passFromRow(result.rows[0]) : null;
    if (!pass || !active(pass)) throw new Error("The search pass is not active.");
    return pass;
  });
}

export function refundLetter(token: string): Promise<void> {
  return store(async (client) => {
    await client.query("UPDATE passes SET letters_used = letters_used - 1 WHERE token = $1 AND letters_used > 0", [token]);
  });
}

export async function readTracker(id: string): Promise<Record<string, Tracked>> {
  assertId(id);
  await ready();
  const result = await getPool().query<{ data: Record<string, Tracked> | null }>("SELECT data FROM trackers WHERE pass_id = $1", [id]);
  const data = result.rows[0]?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

export async function writeTracker(id: string, tracker: Record<string, Tracked>) {
  assertId(id);
  await ready();
  await getPool().query(
    `INSERT INTO trackers (pass_id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (pass_id) DO UPDATE SET data = EXCLUDED.data`,
    [id, JSON.stringify(tracker)],
  );
}

export function cleanProfile(input: Partial<Profile> | null | undefined): Profile {
  return {
    name: String(input?.name ?? "").slice(0, 200),
    roles: String(input?.roles ?? "").slice(0, 300),
    location: String(input?.location ?? "").slice(0, 300),
    remoteOnly: input?.remoteOnly !== false,
    resume: String(input?.resume ?? "").slice(0, 20_000),
    geminiKey: "",
  };
}

export async function readProfile(id: string): Promise<Profile | null> {
  assertId(id);
  await ready();
  const result = await getPool().query<{ data: Partial<Profile> | null }>("SELECT data FROM profiles WHERE pass_id = $1", [id]);
  const data = result.rows[0]?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return cleanProfile(data);
}

export async function writeProfile(id: string, profile: Partial<Profile>) {
  assertId(id);
  await ready();
  const saved = cleanProfile({ ...emptyProfile, ...profile });
  await getPool().query(
    `INSERT INTO profiles (pass_id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (pass_id) DO UPDATE SET data = EXCLUDED.data`,
    [id, JSON.stringify(saved)],
  );
}
