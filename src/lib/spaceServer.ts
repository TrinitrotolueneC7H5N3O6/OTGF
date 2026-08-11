import type { Business, BusinessSpace, Client, Message, Trade } from "./types";
import { applySpaceOpToSpace, type SpaceOp } from "./spaceOps";
import {
  defaultFloorSettings,
  normalizeSpace,
  slugify,
  titleFromSlug,
} from "./spaceNormalize";
import { newerPresentAt } from "./presence";
import { defaultCategories } from "./data";
import { prisma } from "./db";
import { emitSpaceEvent } from "./spaceEvents";
import { toggleMessageReaction } from "./messageSocial";

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
    receiptPayments: [],
    receiptProducts: [],
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
    receiptPayments: Array.isArray(incoming.receiptPayments)
      ? incoming.receiptPayments
      : current.receiptPayments ?? [],
    receiptProducts: Array.isArray(incoming.receiptProducts)
      ? incoming.receiptProducts
      : current.receiptProducts ?? [],
    clients: ordered,
    messages: [...messagesById.values()],
    deletedClientIds: [...deleted],
  });
}

export type PresenceMap = Record<string, string>;

export async function dbListPresence(slug: string): Promise<PresenceMap> {
  const clean = slugify(slug);
  const rows = await prisma.spacePresence.findMany({
    where: { slug: clean },
    select: { clientId: true, presentAt: true },
  });
  const map: PresenceMap = {};
  for (const row of rows) {
    map[row.clientId] = row.presentAt.toISOString();
  }
  return map;
}

export function applyPresence(
  space: BusinessSpace,
  presence: PresenceMap,
): BusinessSpace {
  if (!space.clients.length) return space;
  let changed = false;
  const clients = space.clients.map((c) => {
    const next = presence[c.id];
    if (!next) return c;
    const merged = newerPresentAt(c.presentAt, next);
    if (merged === c.presentAt) return c;
    changed = true;
    return { ...c, presentAt: merged };
  });
  return changed ? { ...space, clients } : space;
}

export async function notifySpaceListeners(slug: string) {
  const meta = await dbGetSpaceMeta(slug);
  if (!meta) return;
  emitSpaceEvent(slug, { type: "meta", ...meta });
}

export async function dbTouchPresence(
  slug: string,
  clientId: string,
): Promise<{ presentAt: string }> {
  const clean = slugify(slug);
  const id = clientId.trim();
  if (!id) throw new Error("clientId required");
  const presentAt = new Date();
  await prisma.spacePresence.upsert({
    where: { slug_clientId: { slug: clean, clientId: id } },
    create: { slug: clean, clientId: id, presentAt },
    update: { presentAt },
  });
  void notifySpaceListeners(clean);
  return { presentAt: presentAt.toISOString() };
}

export async function dbGetSpace(slug: string): Promise<BusinessSpace | null> {
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({ where: { slug: clean } });
  if (!row) return null;
  const space = parseSpace(row.data);
  const presence = await dbListPresence(clean);
  return applyPresence(space, presence);
}

/** Lightweight poll payload — avoids shipping the full space JSON. */
export async function dbGetSpaceMeta(
  slug: string,
): Promise<{ updatedAt: string; presence: PresenceMap } | null> {
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({
    where: { slug: clean },
    select: { updatedAt: true },
  });
  if (!row) return null;
  return {
    updatedAt: row.updatedAt.toISOString(),
    presence: await dbListPresence(clean),
  };
}

export async function dbToggleReaction(
  slug: string,
  input: {
    messageId: string;
    emoji: string;
    actor: {
      from: "business" | "client";
      fromMemberId?: string;
      fromName?: string;
    };
  },
): Promise<{ messageId: string; reactions: Message["reactions"] }> {
  const clean = slugify(slug);
  const result = await withSpaceLock(clean, async () => {
    const existing = await dbGetSpace(clean);
    if (!existing) throw new Error("Space not found");
    const target = existing.messages.find((m) => m.id === input.messageId);
    if (!target) throw new Error("Message not found");

    const reactions = toggleMessageReaction(
      target.reactions,
      input.emoji,
      input.actor,
    );
    emitSpaceEvent(clean, {
      type: "reactions",
      messageId: input.messageId,
      reactions,
    });
    const toStore: BusinessSpace = {
      ...existing,
      messages: existing.messages.map((m) =>
        m.id === input.messageId ? { ...m, reactions } : m,
      ),
    };
    await prisma.space.update({
      where: { slug: clean },
      data: { data: JSON.stringify(toStore) },
    });
    return { messageId: input.messageId, reactions };
  });
  void notifySpaceListeners(clean);
  return result;
}

export type AppendMessageInput = {
  message: Message;
  /** Full client row when creating, or partial patch when updating */
  client: Client;
  /** When true, treat client as upsert (insert if missing) */
  upsertClient?: boolean;
  /** Revive client if it was soft-deleted */
  clearDeleted?: boolean;
  /** Re-order this client to front of the list */
  bumpClient?: boolean;
};

export async function dbAppendMessage(
  slug: string,
  input: AppendMessageInput,
): Promise<{
  message: Message;
  client: Client;
  updatedAt: string;
}> {
  const clean = slugify(slug);
  emitSpaceEvent(clean, {
    type: "message",
    message: input.message,
    client: input.client,
  });
  return withSpaceLock(clean, async () => {
    const existing = await dbGetSpace(clean);
    if (!existing) throw new Error("Space not found");

    if (existing.messages.some((m) => m.id === input.message.id)) {
      const client =
        existing.clients.find((c) => c.id === input.client.id) ?? input.client;
      const meta = await dbGetSpaceMeta(clean);
      return {
        message: input.message,
        client,
        updatedAt: meta?.updatedAt ?? new Date().toISOString(),
      };
    }

    let clients = existing.clients;
    const idx = clients.findIndex((c) => c.id === input.client.id);
    let nextClient: Client;
    if (idx >= 0) {
      nextClient = { ...clients[idx], ...input.client, id: clients[idx].id };
      const rest = clients.filter((c) => c.id !== nextClient.id);
      clients = input.bumpClient ? [nextClient, ...rest] : clients.map((c, i) =>
        i === idx ? nextClient : c,
      );
    } else if (input.upsertClient !== false) {
      nextClient = input.client;
      clients = [nextClient, ...clients];
    } else {
      throw new Error("Client not found");
    }

    let deletedClientIds = existing.deletedClientIds ?? [];
    if (input.clearDeleted) {
      deletedClientIds = deletedClientIds.filter((id) => id !== input.client.id);
    }

    const toStore: BusinessSpace = normalizeSpace({
      ...existing,
      clients,
      messages: [...existing.messages, input.message],
      deletedClientIds,
      business: { ...existing.business, slug: clean },
    });

    const row = await prisma.space.update({
      where: { slug: clean },
      data: { data: JSON.stringify(toStore) },
      select: { updatedAt: true },
    });

    return {
      message: input.message,
      client: nextClient,
      updatedAt: row.updatedAt.toISOString(),
    };
  }).then(async (result) => {
    emitSpaceEvent(clean, {
      type: "message",
      message: result.message,
      client: result.client,
      updatedAt: result.updatedAt,
    });
    void notifySpaceListeners(clean);
    return result;
  });
}

export async function dbApplySpaceOp(
  slug: string,
  op: SpaceOp,
): Promise<BusinessSpace> {
  const clean = slugify(slug);
  if (op.type === "endChat") {
    emitSpaceEvent(clean, {
      type: "message",
      message: op.message,
    });
  }
  const result = await withSpaceLock(clean, async () => {
    const existing = await dbGetSpace(clean);
    if (!existing) throw new Error("Space not found");
    const toStore = applySpaceOpToSpace(existing, op);
    await prisma.space.update({
      where: { slug: clean },
      data: { data: JSON.stringify(toStore) },
    });
    return toStore;
  });
  void notifySpaceListeners(clean);
  return result;
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
  }).then(async (result) => {
    void notifySpaceListeners(clean);
    return result;
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
