import { randomBytes } from "crypto";
import type { Business, BusinessSpace, ChatParticipant, Client, Message, Trade } from "./types";
import { applySpaceOpToSpace, type SpaceOp } from "./spaceOps";
import {
  defaultFloorSettings,
  normalizeSpace,
  slugify,
  titleFromSlug,
  messageTimeStamp,
} from "./spaceNormalize";
import { newerPresentAt } from "./presence";
import { messageCreatedMs } from "./messageTime";
import {
  ensureWelcomeMessages,
  ensureWelcomeMessagesForSpace,
} from "./customerAutoReply";
import { resolveChatIntroMessages } from "./chatIntroMessages";
import { defaultCategories } from "./data";
import { prisma, syncDbFromCookies } from "./db";
import { emitSpaceEvent } from "./spaceEvents";
import { toggleMessageReaction } from "./messageSocial";
import { FORWARD_LINK_TTL_MS, joinedChatLabel } from "./forwardChat";

const writeChains = new Map<string, Promise<unknown>>();
const EMPTY_MESSAGES = "[]";

async function readyDb() {
  await syncDbFromCookies();
}

async function withSpaceLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
  await readyDb();
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

/** Business config stored in Space.data — no clients or messages. */
type SpaceDocument = Omit<
  BusinessSpace,
  "clients" | "messages" | "deletedClientIds"
>;

function blankSpaceDoc(business: Business): SpaceDocument {
  return {
    business,
    categories: defaultCategories.map((c) => ({ ...c })),
    artifacts: [],
    settings: defaultFloorSettings(),
    members: [],
    receiptPayments: [],
    receiptProducts: [],
  };
}

function parseSpaceDoc(raw: string): SpaceDocument {
  const parsed = JSON.parse(raw) as Partial<BusinessSpace>;
  const normalized = normalizeSpace({
    ...parsed,
    clients: [],
    messages: [],
    deletedClientIds: [],
  } as BusinessSpace);
  const { clients: _c, messages: _m, deletedClientIds: _d, ...doc } = normalized;
  return doc;
}

function parseClient(raw: string): Client {
  return JSON.parse(raw) as Client;
}

function parseMessages(raw: string | null | undefined): Message[] {
  if (!raw || raw === EMPTY_MESSAGES) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Message[];
  } catch {
    return [];
  }
}

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(
    (a, b) => (messageCreatedMs(a) ?? 0) - (messageCreatedMs(b) ?? 0),
  );
}

async function touchSpace(slug: string): Promise<Date> {
  const row = await prisma.space.update({
    where: { slug },
    data: { updatedAt: new Date() },
    select: { updatedAt: true },
  });
  return row.updatedAt;
}

async function loadClients(slug: string): Promise<Client[]> {
  const rows = await prisma.chat.findMany({
    where: { spaceSlug: slug, deleted: false },
    orderBy: { updatedAt: "desc" },
    select: { clientData: true },
  });
  return rows.map((row) => parseClient(row.clientData));
}

async function loadThread(
  slug: string,
  chatIds: string[],
): Promise<{ clients: Client[]; messages: Message[] }> {
  if (!chatIds.length) return { clients: [], messages: [] };
  const rows = await prisma.chat.findMany({
    where: { spaceSlug: slug, id: { in: chatIds }, deleted: false },
    select: { clientData: true, messagesData: true },
  });
  return {
    clients: rows.map((row) => parseClient(row.clientData)),
    messages: sortMessages(
      rows.flatMap((row) => parseMessages(row.messagesData)),
    ),
  };
}

async function loadMessages(slug: string, chatIds: string[]): Promise<Message[]> {
  if (!chatIds.length) return [];
  const rows = await prisma.chat.findMany({
    where: { spaceSlug: slug, id: { in: chatIds }, deleted: false },
    select: { messagesData: true },
  });
  const messages = rows.flatMap((row) => parseMessages(row.messagesData));
  return sortMessages(messages);
}

export async function dbChatExists(
  slug: string,
  chatId: string,
): Promise<boolean> {
  await readyDb();
  const clean = slugify(slug);
  const id = chatId.trim();
  if (!id) return false;
  const row = await prisma.chat.findUnique({
    where: { spaceSlug_id: { spaceSlug: clean, id } },
    select: { deleted: true },
  });
  return Boolean(row && !row.deleted);
}

function assembleSpace(
  doc: SpaceDocument,
  clients: Client[],
  messages: Message[],
): BusinessSpace {
  return normalizeSpace({
    ...doc,
    clients,
    messages,
    deletedClientIds: [],
  });
}

export type PresenceMap = Record<string, string>;

export async function dbListPresence(slug: string): Promise<PresenceMap> {
  await readyDb();
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
  await readyDb();
  const meta = await dbGetSpaceMeta(slug);
  if (!meta) return;
  emitSpaceEvent(slug, { type: "meta", ...meta });
}

export async function dbTouchPresence(
  slug: string,
  clientId: string,
): Promise<{ presentAt: string }> {
  await readyDb();
  const clean = slugify(slug);
  const id = clientId.trim();
  if (!id) throw new Error("clientId required");
  const presentAt = new Date();
  await prisma.spacePresence.upsert({
    where: { slug_clientId: { slug: clean, clientId: id } },
    create: { slug: clean, clientId: id, presentAt },
    update: { presentAt },
  });
  emitSpaceEvent(clean, {
    type: "presence",
    clientId: id,
    presentAt: presentAt.toISOString(),
  });
  return { presentAt: presentAt.toISOString() };
}

export async function dbGetSpace(
  slug: string,
  options?: { chatIds?: string[]; threadOnly?: boolean },
): Promise<BusinessSpace | null> {
  await readyDb();
  const clean = slugify(slug);
  const chatIds = options?.chatIds?.filter(Boolean) ?? [];
  const threadOnly = Boolean(options?.threadOnly && chatIds.length > 0);

  if (threadOnly) {
    const [row, thread] = await Promise.all([
      prisma.space.findUnique({ where: { slug: clean } }),
      loadThread(clean, chatIds),
    ]);
    if (!row) return null;
    return assembleSpace(
      parseSpaceDoc(row.data),
      thread.clients,
      thread.messages,
    );
  }

  const [row, clients, messages, presence] = await Promise.all([
    prisma.space.findUnique({ where: { slug: clean } }),
    loadClients(clean),
    chatIds.length > 0
      ? loadMessages(clean, chatIds)
      : Promise.resolve([] as Message[]),
    dbListPresence(clean),
  ]);
  if (!row) return null;
  const space = assembleSpace(parseSpaceDoc(row.data), clients, messages);
  return applyPresence(space, presence);
}

/** Floor boot — inbox + presence + most recent thread in one handler (≤2 DB RTTs). */
export async function dbGetSpaceFloorBoot(
  slug: string,
): Promise<BusinessSpace | null> {
  await readyDb();
  const clean = slugify(slug);
  const [row, clientRows, presence] = await Promise.all([
    prisma.space.findUnique({ where: { slug: clean } }),
    prisma.chat.findMany({
      where: { spaceSlug: clean, deleted: false },
      orderBy: { updatedAt: "desc" },
      select: { clientData: true },
    }),
    dbListPresence(clean),
  ]);
  if (!row) return null;

  const clients = clientRows.map((chatRow) => parseClient(chatRow.clientData));
  const mostRecent = clients.find((c) => c.preview.trim());

  let messages: Message[] = [];
  if (mostRecent) {
    const threadRow = await prisma.chat.findUnique({
      where: {
        spaceSlug_id: { spaceSlug: clean, id: mostRecent.id },
      },
      select: { messagesData: true },
    });
    messages = parseMessages(threadRow?.messagesData).filter(
      (m) => m.clientId === mostRecent.id,
    );
  }

  const space = assembleSpace(
    parseSpaceDoc(row.data),
    clients,
    sortMessages(messages),
  );
  return applyPresence(space, presence);
}

/** Lightweight poll payload — avoids shipping chat JSON. */
export async function dbGetSpaceMeta(
  slug: string,
): Promise<{ updatedAt: string; presence: PresenceMap } | null> {
  await readyDb();
  const clean = slugify(slug);
  const [row, presence] = await Promise.all([
    prisma.space.findUnique({
      where: { slug: clean },
      select: { updatedAt: true },
    }),
    dbListPresence(clean),
  ]);
  if (!row) return null;
  return {
    updatedAt: row.updatedAt.toISOString(),
    presence,
  };
}

export type SpaceEntryClient = {
  id: string;
  email?: string;
  chatEndedAt?: string;
};

export type SpaceEntry = {
  slug: string;
  clients: SpaceEntryClient[];
};

/** Lightweight boot for customer entry — no messages, settings, or presence. */
export async function dbGetSpaceEntry(
  slug: string,
  options?: { chatId?: string },
): Promise<SpaceEntry | null> {
  await readyDb();
  const clean = slugify(slug);
  const chatId = options?.chatId?.trim();

  if (chatId) {
    const [row, chat] = await Promise.all([
      prisma.space.findUnique({
        where: { slug: clean },
        select: { slug: true },
      }),
      prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: clean, id: chatId } },
        select: { clientData: true, deleted: true },
      }),
    ]);
    if (!row) return null;
    const clients: SpaceEntryClient[] = [];
    if (chat && !chat.deleted) {
      const client = parseClient(chat.clientData);
      clients.push({
        id: client.id,
        ...(client.email ? { email: client.email } : {}),
        ...(client.chatEndedAt ? { chatEndedAt: client.chatEndedAt } : {}),
      });
    }
    return { slug: clean, clients };
  }

  const [row, chatRows] = await Promise.all([
    prisma.space.findUnique({
      where: { slug: clean },
      select: { slug: true },
    }),
    prisma.chat.findMany({
      where: { spaceSlug: clean, deleted: false },
      select: { clientData: true },
    }),
  ]);
  if (!row) return null;

  const clients = chatRows.map((chatRow) => {
    const client = parseClient(chatRow.clientData);
    return {
      id: client.id,
      ...(client.email ? { email: client.email } : {}),
      ...(client.chatEndedAt ? { chatEndedAt: client.chatEndedAt } : {}),
    } satisfies SpaceEntryClient;
  });

  return { slug: clean, clients };
}

async function upsertChatRow(
  slug: string,
  client: Client,
  messages?: Message[],
) {
  const clientData = JSON.stringify(client);
  if (messages !== undefined) {
    await prisma.chat.upsert({
      where: { spaceSlug_id: { spaceSlug: slug, id: client.id } },
      create: {
        id: client.id,
        spaceSlug: slug,
        clientData,
        messagesData: JSON.stringify(messages),
        deleted: false,
      },
      update: {
        clientData,
        messagesData: JSON.stringify(messages),
        deleted: false,
      },
    });
    return;
  }

  await prisma.chat.upsert({
    where: { spaceSlug_id: { spaceSlug: slug, id: client.id } },
    create: {
      id: client.id,
      spaceSlug: slug,
      clientData,
      messagesData: EMPTY_MESSAGES,
      deleted: false,
    },
    update: {
      clientData,
      deleted: false,
    },
  });
}

async function appendMessageToChat(
  slug: string,
  client: Client,
  message: Message,
): Promise<{ client: Client; duplicate: boolean }> {
  const row = await prisma.chat.findUnique({
    where: { spaceSlug_id: { spaceSlug: slug, id: client.id } },
    select: { clientData: true, messagesData: true, deleted: true },
  });

  if (row && !row.deleted) {
    const messages = parseMessages(row.messagesData);
    if (messages.some((m) => m.id === message.id)) {
      return {
        client: { ...parseClient(row.clientData), ...client, id: client.id },
        duplicate: true,
      };
    }
    messages.push(message);
    const nextClient = { ...parseClient(row.clientData), ...client, id: client.id };
    await upsertChatRow(slug, nextClient, sortMessages(messages));
    return { client: nextClient, duplicate: false };
  }

  await upsertChatRow(slug, client, [message]);
  return { client, duplicate: false };
}

async function findChatMessage(
  slug: string,
  messageId: string,
): Promise<{ chatId: string; messages: Message[]; index: number } | null> {
  const rows = await prisma.chat.findMany({
    where: { spaceSlug: slug, deleted: false },
    select: { id: true, messagesData: true },
  });
  for (const row of rows) {
    const messages = parseMessages(row.messagesData);
    const index = messages.findIndex((m) => m.id === messageId);
    if (index >= 0) {
      return { chatId: row.id, messages, index };
    }
  }
  return null;
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
    const found = await findChatMessage(clean, input.messageId);
    if (!found) throw new Error("Message not found");
    const target = found.messages[found.index];
    const reactions = toggleMessageReaction(
      target.reactions,
      input.emoji,
      input.actor,
    );
    const nextMessages = [...found.messages];
    nextMessages[found.index] = { ...target, reactions };
    await prisma.chat.update({
      where: {
        spaceSlug_id: { spaceSlug: clean, id: found.chatId },
      },
      data: { messagesData: JSON.stringify(sortMessages(nextMessages)) },
    });
    await touchSpace(clean);
    emitSpaceEvent(clean, {
      type: "reactions",
      messageId: input.messageId,
      reactions,
    });
    return { messageId: input.messageId, reactions };
  });
  void notifySpaceListeners(clean);
  return result;
}

export type AppendMessageInput = {
  message: Message;
  client: Client;
  upsertClient?: boolean;
  clearDeleted?: boolean;
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
    const spaceRow = await prisma.space.findUnique({ where: { slug: clean } });
    if (!spaceRow) throw new Error("Space not found");

    const chatRow = await prisma.chat.findUnique({
      where: { spaceSlug_id: { spaceSlug: clean, id: input.client.id } },
      select: { deleted: true },
    });

    if (chatRow?.deleted && input.upsertClient === false) {
      throw new Error("Client not found");
    }
    if (!chatRow && input.upsertClient === false) {
      throw new Error("Client not found");
    }

    const { client: nextClient, duplicate } = await appendMessageToChat(
      clean,
      input.client,
      input.message,
    );

    if (!duplicate && input.message.from === "client") {
      const doc = parseSpaceDoc(spaceRow.data);
      const intro = resolveChatIntroMessages(doc.settings);
      const chat = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: clean, id: nextClient.id } },
        select: { messagesData: true },
      });
      const currentMessages = parseMessages(chat?.messagesData);
      const withWelcome = ensureWelcomeMessages(
        currentMessages,
        nextClient.id,
        doc.business.name,
        clean,
        intro,
      );
      if (withWelcome !== currentMessages) {
        await upsertChatRow(clean, nextClient, sortMessages(withWelcome));
      }
    }

    if (duplicate) {
      const meta = await dbGetSpaceMeta(clean);
      return {
        message: input.message,
        client: nextClient,
        updatedAt: meta?.updatedAt ?? new Date().toISOString(),
      };
    }

    const updatedAt = await touchSpace(clean);
    return {
      message: input.message,
      client: nextClient,
      updatedAt: updatedAt.toISOString(),
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

async function applyOpToDb(slug: string, op: SpaceOp) {
  switch (op.type) {
    case "renameClient": {
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { clientData: true },
      });
      if (!row) return;
      const client = { ...parseClient(row.clientData), name: op.name };
      await upsertChatRow(slug, client);
      return;
    }
    case "deleteClient": {
      await prisma.chat.delete({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
      }).catch(() =>
        prisma.chat.update({
          where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
          data: { deleted: true, messagesData: EMPTY_MESSAGES },
        }),
      );
      return;
    }
    case "endChat": {
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { clientData: true, messagesData: true },
      });
      if (!row) return;
      const prev = parseClient(row.clientData);
      const client = {
        ...prev,
        chatEndedAt: prev.chatEndedAt || new Date().toISOString(),
        preview: "Chat ended",
        lastActive: "Just now",
        unread: 0,
      };
      const messages = parseMessages(row.messagesData);
      if (!messages.some((m) => m.id === op.message.id)) {
        messages.push(op.message);
      }
      await upsertChatRow(slug, client, sortMessages(messages));
      return;
    }
    case "setOwner": {
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { clientData: true },
      });
      if (!row) return;
      const client = {
        ...parseClient(row.clientData),
        ownerMemberId: op.ownerMemberId ?? undefined,
      };
      await upsertChatRow(slug, client);
      return;
    }
    case "updateMembers":
    case "setLibrary":
    case "setSettings":
    case "setReceipts": {
      const spaceRow = await prisma.space.findUnique({ where: { slug } });
      if (!spaceRow) throw new Error("Space not found");
      const current = await dbGetSpace(slug);
      if (!current) throw new Error("Space not found");
      const next = applySpaceOpToSpace(current, op);
      const { clients: _c, messages: _m, deletedClientIds: _d, ...doc } =
        normalizeSpace(next);
      await prisma.space.update({
        where: { slug },
        data: { data: JSON.stringify(doc) },
      });
      return;
    }
    case "upsertClient": {
      await upsertChatRow(slug, op.client);
      return;
    }
  }
}

export async function dbApplySpaceOp(
  slug: string,
  op: SpaceOp,
): Promise<void> {
  const clean = slugify(slug);
  const updatedAt = await withSpaceLock(clean, async () => {
    await applyOpToDb(clean, op);
    const touched = await touchSpace(clean);
    return touched.toISOString();
  });
  if (op.type === "endChat") {
    emitSpaceEvent(clean, { type: "message", message: op.message, updatedAt });
  }
  emitSpaceEvent(clean, { type: "op", op, updatedAt });
  void notifySpaceListeners(clean);
}

export async function dbSaveSpace(space: BusinessSpace): Promise<BusinessSpace> {
  const clean = slugify(space.business.slug);
  return withSpaceLock(clean, async () => {
    const normalized = ensureWelcomeMessagesForSpace(normalizeSpace(space));
    const { clients, messages, deletedClientIds: _d, ...doc } = normalized;

    await prisma.space.upsert({
      where: { slug: clean },
      create: {
        slug: clean,
        data: JSON.stringify(doc),
      },
      update: {
        data: JSON.stringify(doc),
      },
    });

    const messagesByClient = new Map<string, Message[]>();
    for (const message of messages) {
      const list = messagesByClient.get(message.clientId) ?? [];
      list.push(message);
      messagesByClient.set(message.clientId, list);
    }

    const clientIds = clients
      .filter((client) => !(normalized.deletedClientIds ?? []).includes(client.id))
      .map((client) => client.id);
    const existingRows = clientIds.length
      ? await prisma.chat.findMany({
          where: { spaceSlug: clean, id: { in: clientIds } },
          select: { id: true, messagesData: true },
        })
      : [];
    const existingById = new Map(
      existingRows.map((row) => [row.id, parseMessages(row.messagesData)]),
    );

    for (const client of clients) {
      if ((normalized.deletedClientIds ?? []).includes(client.id)) continue;
      const incoming = messagesByClient.get(client.id) ?? [];
      if (incoming.length === 0) {
        await upsertChatRow(clean, client);
        continue;
      }
      const existing = existingById.get(client.id) ?? [];
      const byId = new Map(existing.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      await upsertChatRow(clean, client, sortMessages([...byId.values()]));
    }

    return (await dbGetSpace(clean)) ?? normalized;
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

    const doc = blankSpaceDoc({
      id: `b-${Date.now().toString(36)}`,
      name: titleFromSlug(clean),
      slug: clean,
      trade,
      createdAt: new Date().toISOString(),
    });
    await prisma.space.create({
      data: { slug: clean, data: JSON.stringify(doc) },
    });
    return assembleSpace(doc, [], []);
  });
}

export async function dbListBusinesses(ownerId?: string): Promise<Business[]> {
  await readyDb();
  if (!ownerId) return [];
  const rows = await prisma.space.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map((row) => {
      try {
        return parseSpaceDoc(row.data).business;
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
  await readyDb();
  const trimmed = name.trim() || "My shop";
  const base = slugify(trimmed);
  let slug = base;
  let i = 2;
  while (await prisma.space.findUnique({ where: { slug } })) {
    slug = `${base}-${i}`;
    i += 1;
  }

  const doc = blankSpaceDoc({
    id: `b-${Date.now()}`,
    name: trimmed,
    slug,
    trade,
    createdAt: new Date().toISOString(),
  });
  await prisma.space.create({
    data: {
      slug,
      data: JSON.stringify(doc),
      ownerId: ownerId || null,
    },
  });
  return assembleSpace(doc, [], []);
}

export async function dbClaimSpace(slug: string, userId: string) {
  await readyDb();
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
  const space = await dbGetSpace(clean);
  if (!space) throw new Error("Space not found.");
  return space;
}

export async function dbUserOwnsSpace(slug: string, userId: string) {
  await readyDb();
  const clean = slugify(slug);
  const row = await prisma.space.findUnique({
    where: { slug: clean },
    select: { ownerId: true },
  });
  return Boolean(row?.ownerId && row.ownerId === userId);
}

export type ForwardInviteMeta = {
  slug: string;
  chatId: string;
  businessName: string;
  customerName: string;
  expiresAt: string;
};

function newForwardToken() {
  return randomBytes(18).toString("base64url");
}

export async function dbCreateForwardLink(
  slug: string,
  chatId: string,
): Promise<{ token: string; expiresAt: string; path: string }> {
  await readyDb();
  const clean = slugify(slug);
  const id = chatId.trim();
  if (!id) throw new Error("chatId required");

  const row = await prisma.chat.findUnique({
    where: { spaceSlug_id: { spaceSlug: clean, id } },
    select: { deleted: true, clientData: true },
  });
  if (!row || row.deleted) throw new Error("Chat not found");

  const client = parseClient(row.clientData);
  const now = Date.now();
  const existingExp = client.forwardExpiresAt
    ? Date.parse(client.forwardExpiresAt)
    : NaN;
  if (
    client.forwardToken &&
    Number.isFinite(existingExp) &&
    existingExp > now
  ) {
    return {
      token: client.forwardToken,
      expiresAt: new Date(existingExp).toISOString(),
      path: `/${clean}/f/${client.forwardToken}`,
    };
  }

  const token = newForwardToken();
  const expiresAt = new Date(now + FORWARD_LINK_TTL_MS);
  await upsertChatRow(clean, {
    ...client,
    forwardToken: token,
    forwardExpiresAt: expiresAt.toISOString(),
  });
  return {
    token,
    expiresAt: expiresAt.toISOString(),
    path: `/${clean}/f/${token}`,
  };
}

export async function dbGetForwardInvite(
  token: string,
  spaceSlug?: string,
): Promise<ForwardInviteMeta | null> {
  await readyDb();
  const raw = token.trim();
  if (!raw) return null;
  const clean = spaceSlug ? slugify(spaceSlug) : "";
  const rows = await prisma.chat.findMany({
    where: {
      deleted: false,
      ...(clean ? { spaceSlug: clean } : {}),
    },
    select: { id: true, spaceSlug: true, clientData: true },
  });
  const chat = rows.find((row) => {
    const client = parseClient(row.clientData);
    return client.forwardToken === raw;
  });
  if (!chat) return null;
  const client = parseClient(chat.clientData);
  const exp = client.forwardExpiresAt
    ? Date.parse(client.forwardExpiresAt)
    : NaN;
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;

  const space = await prisma.space.findUnique({
    where: { slug: chat.spaceSlug },
    select: { data: true },
  });
  if (!space) return null;
  const doc = parseSpaceDoc(space.data);
  return {
    slug: chat.spaceSlug,
    chatId: chat.id,
    businessName: doc.business.name,
    customerName: client.name || "Guest",
    expiresAt: new Date(exp).toISOString(),
  };
}

export async function dbJoinForward(
  token: string,
  input: { name: string; department?: string; participantId?: string },
  spaceSlug?: string,
): Promise<{
  slug: string;
  chatId: string;
  participant: ChatParticipant;
  message: Message;
  client: Client;
}> {
  const invite = await dbGetForwardInvite(token, spaceSlug);
  if (!invite) throw new Error("This forward link expired.");

  const name = input.name.trim().slice(0, 48);
  if (!name) throw new Error("Enter a name.");
  const department = input.department?.trim().slice(0, 48) || "";

  const row = await prisma.chat.findUnique({
    where: { spaceSlug_id: { spaceSlug: invite.slug, id: invite.chatId } },
    select: { clientData: true },
  });
  if (!row) throw new Error("Chat not found");
  const client = parseClient(row.clientData);
  const existing = (client.participants ?? []).find(
    (p) => p.id === input.participantId,
  );
  if (existing) {
    return {
      slug: invite.slug,
      chatId: invite.chatId,
      participant: existing,
      message: {
        id: `sys-existing-${existing.id}`,
        clientId: client.id,
        from: "business",
        kind: "system",
        body: joinedChatLabel(existing.name, existing.department),
        fromName: existing.name,
        fromMemberId: existing.id,
        ...messageTimeStamp(),
      },
      client,
    };
  }

  const participant: ChatParticipant = {
    id:
      input.participantId?.trim() ||
      `fwd-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    name,
    joinedAt: new Date().toISOString(),
    ...(department ? { department } : {}),
  };
  const label = joinedChatLabel(participant.name, participant.department);
  const nextClient: Client = {
    ...client,
    participants: [...(client.participants ?? []), participant],
    preview: label,
    lastActive: "Just now",
    unread: (client.unread ?? 0) + 1,
  };
  const message: Message = {
    id: `sys-${participant.id}`,
    clientId: client.id,
    from: "business",
    kind: "system",
    body: label,
    fromName: participant.name,
    fromMemberId: participant.id,
    ...messageTimeStamp(),
  };

  await dbAppendMessage(invite.slug, {
    message,
    client: nextClient,
    upsertClient: true,
    bumpClient: true,
  });

  return {
    slug: invite.slug,
    chatId: invite.chatId,
    participant,
    message,
    client: nextClient,
  };
}
