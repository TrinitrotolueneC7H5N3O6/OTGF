import type { Business, BusinessSpace, Client, Message, Trade } from "./types";
import {
  defaultFloorSettings,
  normalizeSpace,
  slugify,
  titleFromSlug,
} from "./spaceNormalize";
import { newerPresentAt } from "./presence";
import { defaultCategories } from "./data";
import { prisma } from "./db";

const writeChains = new Map<string, Promise<unknown>>();

async function withSpaceLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  const clean = slugify(slug);
  const previous = writeChains.get(clean) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  writeChains.set(clean, chained.catch(() => undefined));
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (writeChains.get(clean) === chained) {
      writeChains.delete(clean);
    }
  }
}

function blankSpace(business: Business): BusinessSpace {
  return {
    business,
    clients: [],
    messages: [],
    categories: defaultCategories.map((c) => ({ ...c })),
    artifacts: [],
    settings: defaultFloorSettings(),
    members: [],
  };
}

function parseSpace(raw: string): BusinessSpace {
  return normalizeSpace(JSON.parse(raw) as BusinessSpace);
}

/** Merge two spaces so concurrent floor/chat writes keep all messages. */
function mergeSpaces(
  current: BusinessSpace,
  incoming: BusinessSpace,
): BusinessSpace {
  const deleted = new Set<string>([
    ...(current.deletedClientIds ?? []),
    ...(incoming.deletedClientIds ?? []),
  ]);

  const messagesById = new Map<string, Message>();
  for (const m of current.messages) {
    if (!deleted.has(m.clientId)) messagesById.set(m.id, m);
  }
  for (const m of incoming.messages) {
    if (!deleted.has(m.clientId)) messagesById.set(m.id, m);
  }

  const clientsById = new Map<string, Client>();
  for (const c of current.clients) {
    if (!deleted.has(c.id)) clientsById.set(c.id, c);
  }
  for (const c of incoming.clients) {
    if (deleted.has(c.id)) continue;
    const prev = clientsById.get(c.id);
    clientsById.set(
      c.id,
      prev
        ? {
            ...prev,
            ...c,
            unread: Math.max(prev.unread, c.unread),
            presentAt: newerPresentAt(prev.presentAt, c.presentAt),
            chatEndedAt: prev.chatEndedAt || c.chatEndedAt,
          }
        : c,
    );
  }

  const ordered: Client[] = [];
  const seen = new Set<string>();
  for (const c of incoming.clients) {
    if (deleted.has(c.id) || seen.has(c.id)) continue;
    const merged = clientsById.get(c.id);
    if (merged) {
      ordered.push(merged);
      seen.add(c.id);
    }
  }
  for (const c of current.clients) {
    if (deleted.has(c.id) || seen.has(c.id)) continue;
    const merged = clientsById.get(c.id);
    if (merged) {
      ordered.push(merged);
      seen.add(c.id);
    }
  }

  return normalizeSpace({
    ...incoming,
    business: incoming.business,
    settings: incoming.settings ?? current.settings,
    members: incoming.members?.length ? incoming.members : current.members ?? [],
    categories: incoming.categories?.length
      ? incoming.categories
      : current.categories,
    artifacts: Array.isArray(incoming.artifacts)
      ? incoming.artifacts
      : current.artifacts,
    clients: ordered,
    messages: [...messagesById.values()],
    deletedClientIds: [...deleted],
  });
}

export async function dbGetSpace(slug: string): Promise<BusinessSpace | null> {
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({ where: { slug: clean } });
  if (!row) return null;
  return parseSpace(row.data);
}

export async function dbSaveSpace(space: BusinessSpace): Promise<BusinessSpace> {
  const clean = slugify(space.business.slug);
  return withSpaceLock(clean, async () => {
    const existing = await dbGetSpace(clean);
    const merged = existing
      ? mergeSpaces(existing, space)
      : normalizeSpace(space);
    const toStore: BusinessSpace = {
      ...merged,
      business: { ...merged.business, slug: clean },
    };
    await prisma.space.upsert({
      where: { slug: clean },
      create: {
        slug: clean,
        data: JSON.stringify(toStore),
      },
      update: {
        data: JSON.stringify(toStore),
      },
    });
    return toStore;
  });
}

export async function dbEnsureSpace(
  slug: string,
  trade: Trade = "salon",
): Promise<BusinessSpace> {
  return withSpaceLock(slug, async () => {
    const clean = slugify(slug);
    const existing = await dbGetSpace(clean);
    if (existing) return existing;

    const space = blankSpace({
      id: `b-${Date.now().toString(36)}`,
      name: titleFromSlug(clean),
      slug: clean,
      trade,
      createdAt: new Date().toISOString(),
    });
    await prisma.space.create({
      data: { slug: clean, data: JSON.stringify(space) },
    });
    return space;
  });
}

export async function dbListBusinesses(ownerId?: string): Promise<Business[]> {
  if (!ownerId) return [];
  const rows = await prisma.space.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map((row) => {
      try {
        return parseSpace(row.data).business;
      } catch {
        return null;
      }
    })
    .filter((b): b is Business => Boolean(b));
}

export async function dbCreateBusiness(
  name: string,
  trade: Trade,
  ownerId?: string,
): Promise<BusinessSpace> {
  const trimmed = name.trim() || "My shop";
  const base = slugify(trimmed);
  let slug = base;
  let i = 2;
  while (await prisma.space.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i += 1;
  }

  const space = blankSpace({
    id: `b-${Date.now()}`,
    name: trimmed,
    slug,
    trade,
    createdAt: new Date().toISOString(),
  });
  await prisma.space.create({
    data: {
      slug,
      data: JSON.stringify(space),
      ownerId: ownerId || null,
    },
  });
  return space;
}

/** Attach an unowned (or already-owned-by-user) space to this account. */
export async function dbClaimSpace(slug: string, userId: string) {
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({ where: { slug: clean } });
  if (!row) throw new Error("Space not found.");
  if (row.ownerId && row.ownerId !== userId) {
    throw new Error("That space belongs to another account.");
  }
  if (!row.ownerId) {
    await prisma.space.update({
      where: { slug: clean },
      data: { ownerId: userId },
    });
  }
  return parseSpace(row.data);
}

export async function dbUserOwnsSpace(slug: string, userId: string) {
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({
    where: { slug: clean },
    select: { ownerId: true },
  });
  return Boolean(row?.ownerId && row.ownerId === userId);
}
