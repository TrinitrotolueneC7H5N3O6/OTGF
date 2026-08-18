import { PrismaClient } from "@prisma/client";

export type DbTarget = "local" | "supabase";

const COOKIE = "otgf-db";

const globalForPrisma = globalThis as unknown as {
  prismaByTarget?: Partial<Record<DbTarget, PrismaClient>>;
  dbTarget?: DbTarget;
};

function localUrl() {
  return process.env.LOCAL_DATABASE_URL?.trim() || "";
}

function supabaseUrl() {
  return (
    process.env.SUPABASE_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

export function dbStatus() {
  return {
    localConfigured: Boolean(localUrl()),
    supabaseConfigured: Boolean(supabaseUrl()),
  };
}

export function defaultDbTarget(): DbTarget {
  return localUrl() ? "local" : "supabase";
}

export function getDbTarget(): DbTarget {
  return globalForPrisma.dbTarget ?? defaultDbTarget();
}

export function setDbTarget(target: DbTarget) {
  if (target === "local" && !localUrl()) {
    throw new Error("Set LOCAL_DATABASE_URL for the local Postgres.");
  }
  if (target === "supabase" && !supabaseUrl()) {
    throw new Error("Set DATABASE_URL or SUPABASE_DATABASE_URL for Supabase.");
  }
  globalForPrisma.dbTarget = target;
}

function urlFor(target: DbTarget) {
  const url = target === "local" ? localUrl() : supabaseUrl();
  if (!url) {
    throw new Error(
      target === "local"
        ? "LOCAL_DATABASE_URL is not set"
        : "Supabase DATABASE_URL is not set",
    );
  }
  return url;
}

function clientFor(target: DbTarget) {
  const cache = (globalForPrisma.prismaByTarget ??= {});
  const existing = cache[target];
  if (existing) return existing;
  const client = new PrismaClient({
    datasources: { db: { url: urlFor(target) } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  cache[target] = client;
  return client;
}

/** Active Prisma client — local Postgres or Supabase, same schema. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = clientFor(getDbTarget());
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

export const DB_COOKIE = COOKIE;

export async function syncDbFromCookies() {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const value = jar.get(COOKIE)?.value;
    if (value === "local" || value === "supabase") {
      try {
        setDbTarget(value);
      } catch {
        // keep current target if the chosen URL is missing
      }
    }
  } catch {
    // Not in a request (scripts / prisma generate)
  }
}

export function applyDbCookieFromRequest(request: Request) {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (raw === "local" || raw === "supabase") {
    try {
      setDbTarget(raw);
    } catch {
      // ignore
    }
  }
}
