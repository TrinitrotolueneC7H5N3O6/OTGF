import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import type { AutoAnswerDraft, Business, BusinessSpace, ChatParticipant, Client, CustomerCase, Message, Offering, KnowledgeNote, Trade } from "./types";
import { applySpaceOpToSpace, type SpaceOp } from "./spaceOps";
import {
  defaultFloorSettings,
  normalizeCustomerCaseIdentifiers,
  normalizeCustomerCaseStatus,
  normalizeCustomerCases,
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
import { normalizeOfferings } from "./offerings";
import { normalizeKnowledgeNotes } from "./knowledge";
import {
  generateAutoAnswerBody,
  latestAnswerableClientMessage,
  newAutoAnswerDraftId,
  shouldStartAutoAnswer,
  withoutAutoAnswerDraft,
} from "./autoAnswer";

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
  "clients" | "messages" | "deletedClientIds" | "cases"
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
    offerings: [],
    knowledgeNotes: [],
  };
}

function parseSpaceDoc(raw: string): SpaceDocument {
  const parsed = JSON.parse(raw) as Partial<BusinessSpace>;
  const normalized = normalizeSpace({
    ...parsed,
    clients: [],
    messages: [],
    deletedClientIds: [],
    cases: [],
  } as BusinessSpace);
  const {
    clients: _c,
    messages: _m,
    deletedClientIds: _d,
    offerings: _o,
    knowledgeNotes: _k,
    cases: _cases,
    ...doc
  } = normalized;
  return { ...doc, offerings: [], knowledgeNotes: [] };
}

function parseClient(raw: string): Client {
  return JSON.parse(raw) as Client;
}

function clientFromRow(row: {
  clientData: string;
  customerCaseId?: string | null;
  hiddenFromInbox?: boolean | null;
}): Client {
  return {
    ...parseClient(row.clientData),
    ...(row.customerCaseId ? { caseId: row.customerCaseId } : {}),
    ...(row.hiddenFromInbox ? { hiddenFromInbox: true } : {}),
  };
}

function stripChatDbFields(client: Client): Client {
  const { caseId: _caseId, hiddenFromInbox: _hiddenFromInbox, ...rest } = client;
  return rest;
}

/** Keep staff-only auto-answer fields unless the writer explicitly sent them. */
function mergeClientRecord(existing: Client, incoming: Client): Client {
  const merged: Client = { ...existing, ...incoming, id: incoming.id };
  if (!Object.prototype.hasOwnProperty.call(incoming, "autoAnswerDraft")) {
    if (existing.autoAnswerDraft) merged.autoAnswerDraft = existing.autoAnswerDraft;
    else delete merged.autoAnswerDraft;
  } else if (!incoming.autoAnswerDraft) {
    delete merged.autoAnswerDraft;
  }
  if (!Object.prototype.hasOwnProperty.call(incoming, "autoAnswerOff")) {
    if (existing.autoAnswerOff) merged.autoAnswerOff = true;
    else delete merged.autoAnswerOff;
  }
  return merged;
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
    select: { clientData: true, customerCaseId: true, hiddenFromInbox: true },
  });
  return rows.map(clientFromRow);
}

async function loadThread(
  slug: string,
  chatIds: string[],
): Promise<{ clients: Client[]; messages: Message[] }> {
  if (!chatIds.length) return { clients: [], messages: [] };
  const rows = await prisma.chat.findMany({
    where: { spaceSlug: slug, id: { in: chatIds }, deleted: false },
    select: {
      clientData: true,
      messagesData: true,
      customerCaseId: true,
      hiddenFromInbox: true,
    },
  });
  return {
    clients: rows.map(clientFromRow),
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

function serializeSpaceDoc(doc: SpaceDocument): string {
  const { offerings: _offerings, knowledgeNotes: _knowledge, cases: _cases, ...rest } =
    doc as SpaceDocument & { cases?: CustomerCase[] };
  return JSON.stringify(rest);
}

function offeringFromRow(row: {
  id: string;
  title: string;
  description: string;
  price: string;
  kind: string;
  imageUrl: string;
  sortOrder: number;
}): Offering {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    kind: row.kind === "product" ? "product" : "service",
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
    sortOrder: row.sortOrder,
  };
}

async function loadOfferings(slug: string): Promise<Offering[]> {
  const rows = await prisma.offering.findMany({
    where: { spaceSlug: slug },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(offeringFromRow);
}

async function replaceOfferings(slug: string, offerings: Offering[]) {
  const next = normalizeOfferings(offerings);
  const now = new Date();
  await prisma.$transaction([
    prisma.offering.deleteMany({ where: { spaceSlug: slug } }),
    ...(next.length
      ? [
          prisma.offering.createMany({
            data: next.map((item, index) => ({
              id: item.id,
              spaceSlug: slug,
              title: item.title,
              description: item.description,
              price: item.price,
              kind: item.kind,
              imageUrl: item.imageUrl ?? "",
              sortOrder: item.sortOrder ?? index,
              createdAt: now,
              updatedAt: now,
            })),
          }),
        ]
      : []),
  ]);
}

function knowledgeFromRow(row: {
  id: string;
  horizon: string;
  title: string;
  body: string;
  expiresAt: Date | null;
  sortOrder: number;
}): KnowledgeNote {
  return {
    id: row.id,
    horizon: row.horizon === "short" ? "short" : "long",
    title: row.title,
    body: row.body,
    ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
    sortOrder: row.sortOrder,
  };
}

async function loadKnowledgeNotes(slug: string): Promise<KnowledgeNote[]> {
  const rows = await prisma.knowledgeNote.findMany({
    where: { spaceSlug: slug },
    orderBy: [{ horizon: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(knowledgeFromRow);
}

async function replaceKnowledgeNotes(slug: string, notes: KnowledgeNote[]) {
  const next = normalizeKnowledgeNotes(notes);
  const now = new Date();
  await prisma.$transaction([
    prisma.knowledgeNote.deleteMany({ where: { spaceSlug: slug } }),
    ...(next.length
      ? [
          prisma.knowledgeNote.createMany({
            data: next.map((item, index) => ({
              id: item.id,
              spaceSlug: slug,
              horizon: item.horizon,
              title: item.title,
              body: item.body,
              expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
              sortOrder: item.sortOrder ?? index,
              createdAt: now,
              updatedAt: now,
            })),
          }),
        ]
      : []),
  ]);
}

function customerCaseFromRow(row: {
  id: string;
  status: string;
  notes: string;
  identifiers: unknown;
  createdAt: Date;
  updatedAt: Date;
}): CustomerCase {
  return {
    id: row.id,
    status: normalizeCustomerCaseStatus(row.status),
    notes: row.notes,
    identifiers: normalizeCustomerCaseIdentifiers(row.identifiers),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadCases(slug: string): Promise<CustomerCase[]> {
  const rows = await prisma.customerCase.findMany({
    where: { spaceSlug: slug },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(customerCaseFromRow);
}

export async function dbGetOffering(
  slug: string,
  offeringId: string,
): Promise<Offering | null> {
  await readyDb();
  const clean = slugify(slug);
  const id = offeringId.trim();
  if (!id) return null;
  const row = await prisma.offering.findFirst({
    where: { spaceSlug: clean, id },
  });
  return row ? offeringFromRow(row) : null;
}

function assembleSpace(
  doc: SpaceDocument,
  clients: Client[],
  messages: Message[],
  offerings: Offering[] = [],
  knowledgeNotes: KnowledgeNote[] = [],
  cases: CustomerCase[] = [],
): BusinessSpace {
  return normalizeSpace({
    ...doc,
    offerings,
    knowledgeNotes,
    cases,
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
    const [row, thread, offerings, knowledgeNotes, cases] = await Promise.all([
      prisma.space.findUnique({ where: { slug: clean } }),
      loadThread(clean, chatIds),
      loadOfferings(clean),
      loadKnowledgeNotes(clean),
      loadCases(clean),
    ]);
    if (!row) return null;
    return assembleSpace(
      parseSpaceDoc(row.data),
      thread.clients.map(withoutAutoAnswerDraft),
      thread.messages,
      offerings,
      knowledgeNotes,
      cases,
    );
  }

  const [row, clients, messages, presence, offerings, knowledgeNotes, cases] =
    await Promise.all([
      prisma.space.findUnique({ where: { slug: clean } }),
      loadClients(clean),
      chatIds.length > 0
        ? loadMessages(clean, chatIds)
        : Promise.resolve([] as Message[]),
      dbListPresence(clean),
      loadOfferings(clean),
      loadKnowledgeNotes(clean),
      loadCases(clean),
    ]);
  if (!row) return null;
  const space = assembleSpace(
    parseSpaceDoc(row.data),
    clients,
    messages,
    offerings,
    knowledgeNotes,
    cases,
  );
  return applyPresence(space, presence);
}

/** Floor boot — inbox + presence + most recent thread in one handler (≤2 DB RTTs). */
export async function dbGetSpaceFloorBoot(
  slug: string,
): Promise<BusinessSpace | null> {
  await readyDb();
  const clean = slugify(slug);
  const [row, clientRows, presence, offerings, knowledgeNotes, cases] = await Promise.all([
    prisma.space.findUnique({ where: { slug: clean } }),
    prisma.chat.findMany({
      where: { spaceSlug: clean, deleted: false },
      orderBy: { updatedAt: "desc" },
      select: { clientData: true, customerCaseId: true, hiddenFromInbox: true },
    }),
    dbListPresence(clean),
    loadOfferings(clean),
    loadKnowledgeNotes(clean),
    loadCases(clean),
  ]);
  if (!row) return null;

  const clients = clientRows.map(clientFromRow);
  const mostRecent = clients.find((c) => c.preview.trim() && !c.hiddenFromInbox);

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
    offerings,
    knowledgeNotes,
    cases,
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
  const clientData = JSON.stringify(stripChatDbFields(client));
  if (messages !== undefined) {
    await prisma.chat.upsert({
      where: { spaceSlug_id: { spaceSlug: slug, id: client.id } },
      create: {
        id: client.id,
        spaceSlug: slug,
        customerCaseId: client.caseId,
        hiddenFromInbox: Boolean(client.hiddenFromInbox),
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
        customerCaseId: client.caseId,
        hiddenFromInbox: Boolean(client.hiddenFromInbox),
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
    select: {
      clientData: true,
      messagesData: true,
      deleted: true,
      customerCaseId: true,
      hiddenFromInbox: true,
    },
  });

  if (row && !row.deleted) {
    const messages = parseMessages(row.messagesData);
    const existing = clientFromRow(row);
    if (messages.some((m) => m.id === message.id)) {
      return {
        client: mergeClientRecord(existing, client),
        duplicate: true,
      };
    }
    messages.push(message);
    let nextClient = mergeClientRecord(existing, client);
    if (message.from === "business") {
      nextClient = withoutAutoAnswerDraft(nextClient);
    }
    await upsertChatRow(slug, nextClient, sortMessages(messages));
    return { client: nextClient, duplicate: false };
  }

  await upsertChatRow(slug, client, [message]);
  return { client, duplicate: false };
}

/** One chat only — never scan sibling conversations. */
async function loadIsolatedChat(slug: string, chatId: string) {
  const row = await prisma.chat.findUnique({
    where: { spaceSlug_id: { spaceSlug: slug, id: chatId } },
    select: {
      clientData: true,
      messagesData: true,
      deleted: true,
      customerCaseId: true,
      hiddenFromInbox: true,
    },
  });
  if (!row || row.deleted) return null;
  return {
    client: clientFromRow(row),
    messages: sortMessages(
      parseMessages(row.messagesData).filter((m) => m.clientId === chatId),
    ),
  };
}

const autoAnswerJobSeq = new Map<string, number>();

function autoAnswerJobKey(slug: string, chatId: string) {
  return `${slug}::${chatId}`;
}

async function persistIsolatedDraft(
  slug: string,
  chatId: string,
  draft: AutoAnswerDraft | null,
) {
  const updatedAt = await withSpaceLock(slug, async () => {
    const isolated = await loadIsolatedChat(slug, chatId);
    if (!isolated) return null;
    if (
      draft &&
      isolated.client.autoAnswerDraft &&
      isolated.client.autoAnswerDraft.id !== draft.id &&
      isolated.client.autoAnswerDraft.sourceMessageId !== draft.sourceMessageId
    ) {
      // A newer draft for this chat won; do not clobber it.
      return null;
    }
    const client = draft
      ? { ...isolated.client, autoAnswerDraft: draft }
      : withoutAutoAnswerDraft(isolated.client);
    await upsertChatRow(slug, client);
    const touched = await touchSpace(slug);
    return touched.toISOString();
  });
  if (!updatedAt) return;
  emitSpaceEvent(slug, {
    type: "op",
    op: { type: "setAutoAnswerDraft", clientId: chatId, draft },
    updatedAt,
  });
  void notifySpaceListeners(slug);
}

async function afterAppendMessage(
  slug: string,
  message: Message,
  chatId: string,
) {
  if (message.from !== "client") return;
  await runAutoAnswerJob(slug, chatId, message.id);
}

async function runAutoAnswerJob(
  slug: string,
  chatId: string,
  sourceMessageId?: string,
) {
  const key = autoAnswerJobKey(slug, chatId);
  const seq = (autoAnswerJobSeq.get(key) ?? 0) + 1;
  autoAnswerJobSeq.set(key, seq);

  const spaceRow = await prisma.space.findUnique({ where: { slug } });
  if (!spaceRow) return;
  const doc = parseSpaceDoc(spaceRow.data);

  const [isolated, offerings, knowledgeNotes] = await Promise.all([
    loadIsolatedChat(slug, chatId),
    loadOfferings(slug),
    loadKnowledgeNotes(slug),
  ]);
  if (!isolated) return;

  const source =
    (sourceMessageId
      ? isolated.messages.find((m) => m.id === sourceMessageId && m.clientId === chatId)
      : undefined) ?? latestAnswerableClientMessage(isolated.messages, chatId);
  if (!source) return;

  if (
    !shouldStartAutoAnswer({
      autoAnswerOn: Boolean(doc.settings.autoAnswer),
      client: isolated.client,
      source,
      thread: isolated.messages,
    })
  ) {
    return;
  }

  const reuse =
    isolated.client.autoAnswerDraft?.sourceMessageId === source.id
      ? isolated.client.autoAnswerDraft
      : undefined;
  const working: AutoAnswerDraft = {
    id: reuse?.id || newAutoAnswerDraftId(),
    sourceMessageId: source.id,
    body: reuse?.body ?? "",
    createdAt: new Date().toISOString(),
    status: "working",
  };
  await persistIsolatedDraft(slug, chatId, working);

  let body = "";
  let error = "";
  try {
    body = await generateAutoAnswerBody({
      businessName: doc.business.name,
      trade: doc.business.trade,
      clientName: isolated.client.name,
      clientNote: isolated.client.note,
      messages: isolated.messages,
      chatId,
      knowledgeNotes,
      offerings,
      assistBehavior: doc.settings.assistBehavior,
      autoAnswerMessage: doc.settings.autoAnswerMessage,
    });
  } catch (err) {
    error = err instanceof Error ? err.message : "Couldn’t draft a reply.";
  }

  if (autoAnswerJobSeq.get(key) !== seq) return;

  const latest = await loadIsolatedChat(slug, chatId);
  if (!latest) return;
  const still = latestAnswerableClientMessage(latest.messages, chatId);
  if (!still || still.id !== source.id) return;
  if (
    latest.client.autoAnswerDraft?.id &&
    latest.client.autoAnswerDraft.id !== working.id &&
    latest.client.autoAnswerDraft.sourceMessageId !== source.id
  ) {
    return;
  }

  await persistIsolatedDraft(
    slug,
    chatId,
    error
      ? { ...working, status: "failed", error }
      : { ...working, status: "ready", body },
  );
}

async function findChatMessage(
  slug: string,
  messageId: string,
): Promise<{ chatId: string; messages: Message[]; index: number } | null> {
  // One-message lookup across chats (reactions only — not used for auto-answer).
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
    client: withoutAutoAnswerDraft(input.client),
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
        duplicate: true,
      };
    }

    const updatedAt = await touchSpace(clean);
    return {
      message: input.message,
      client: nextClient,
      updatedAt: updatedAt.toISOString(),
      duplicate: false,
    };
  }).then(async (result) => {
    emitSpaceEvent(clean, {
      type: "message",
      message: result.message,
      client: withoutAutoAnswerDraft(result.client),
      updatedAt: result.updatedAt,
    });
    if (
      result.message.from === "business" &&
      result.client.autoAnswerDraft === undefined
    ) {
      emitSpaceEvent(clean, {
        type: "op",
        op: {
          type: "setAutoAnswerDraft",
          clientId: result.client.id,
          draft: null,
        },
        updatedAt: result.updatedAt,
      });
    }
    void notifySpaceListeners(clean);
    if (!result.duplicate) {
      void afterAppendMessage(clean, result.message, result.client.id);
    }
    return {
      message: result.message,
      client: withoutAutoAnswerDraft(result.client),
      updatedAt: result.updatedAt,
    };
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
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { customerCaseId: true },
      });
      if (row?.customerCaseId) {
        await prisma.chat.update({
          where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
          data: { hiddenFromInbox: true },
        });
        return;
      }
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
      const client = withoutAutoAnswerDraft({
        ...prev,
        chatEndedAt: prev.chatEndedAt || new Date().toISOString(),
        preview: "Chat ended",
        lastActive: "Just now",
        unread: 0,
      });
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
      const { clients: _c, messages: _m, deletedClientIds: _d, cases: _cases, ...doc } =
        normalizeSpace(next);
      await prisma.space.update({
        where: { slug },
        data: { data: serializeSpaceDoc(doc) },
      });
      return;
    }
    case "setOfferings": {
      await replaceOfferings(slug, op.offerings);
      return;
    }
    case "setKnowledgeNotes": {
      await replaceKnowledgeNotes(slug, op.knowledgeNotes);
      return;
    }
    case "createCase": {
      const [customerCase] = normalizeCustomerCases([op.customerCase]);
      if (!customerCase) throw new Error("Case id required");
      await prisma.customerCase.create({
        data: {
          id: customerCase.id,
          spaceSlug: slug,
          status: customerCase.status,
          notes: customerCase.notes,
          identifiers: customerCase.identifiers as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }
    case "updateCaseStatus": {
      await prisma.customerCase.update({
        where: { id: op.caseId },
        data: { status: normalizeCustomerCaseStatus(op.status) },
      });
      return;
    }
    case "updateCaseNotes": {
      await prisma.customerCase.update({
        where: { id: op.caseId },
        data: { notes: op.notes.trim().slice(0, 4000) },
      });
      return;
    }
    case "updateCaseIdentifiers": {
      await prisma.customerCase.update({
        where: { id: op.caseId },
        data: {
          identifiers: normalizeCustomerCaseIdentifiers(
            op.identifiers,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      return;
    }
    case "assignChatCase": {
      const caseId = op.caseId?.trim() || null;
      if (caseId) {
        const customerCase = await prisma.customerCase.findFirst({
          where: { id: caseId, spaceSlug: slug },
          select: { id: true },
        });
        if (!customerCase) throw new Error("Case not found");
      }
      await prisma.chat.update({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        data: {
          customerCaseId: caseId,
          hiddenFromInbox: caseId ? undefined : false,
        },
      });
      return;
    }
    case "hideClient": {
      await prisma.chat.update({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        data: { hiddenFromInbox: op.hidden ?? true },
      });
      return;
    }
    case "upsertClient": {
      await upsertChatRow(slug, op.client);
      return;
    }
    case "setAutoAnswerDraft": {
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { clientData: true },
      });
      if (!row) return;
      const prev = parseClient(row.clientData);
      const client = op.draft
        ? { ...prev, autoAnswerDraft: op.draft }
        : withoutAutoAnswerDraft(prev);
      await upsertChatRow(slug, client);
      return;
    }
    case "setAutoAnswerOff": {
      const row = await prisma.chat.findUnique({
        where: { spaceSlug_id: { spaceSlug: slug, id: op.clientId } },
        select: { clientData: true },
      });
      if (!row) return;
      const prev = parseClient(row.clientData);
      const client = op.off
        ? { ...prev, autoAnswerOff: true }
        : { ...prev, autoAnswerOff: undefined };
      if (!op.off) delete client.autoAnswerOff;
      await upsertChatRow(slug, client);
      return;
    }
    case "retryAutoAnswer": {
      const isolated = await loadIsolatedChat(slug, op.clientId);
      if (!isolated) return;
      const source =
        isolated.client.autoAnswerDraft?.sourceMessageId ||
        latestAnswerableClientMessage(isolated.messages, op.clientId)?.id;
      if (!source) return;
      const { error: _error, ...rest } = isolated.client.autoAnswerDraft ?? {
        id: newAutoAnswerDraftId(),
        sourceMessageId: source,
        body: "",
        createdAt: new Date().toISOString(),
        status: "working" as const,
      };
      const draft: AutoAnswerDraft = {
        ...rest,
        sourceMessageId: source,
        status: "working",
        body: rest.body ?? "",
        id: rest.id || newAutoAnswerDraftId(),
        createdAt: rest.createdAt || new Date().toISOString(),
      };
      await upsertChatRow(slug, {
        ...isolated.client,
        autoAnswerDraft: draft,
      });
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
  if (op.type === "retryAutoAnswer") {
    void runAutoAnswerJob(clean, op.clientId);
  }
}

export async function dbSaveSpace(space: BusinessSpace): Promise<BusinessSpace> {
  const clean = slugify(space.business.slug);
  const pendingAutoAnswer: { chatId: string; messageId: string }[] = [];
  const newlyStored: { message: Message; client: Client }[] = [];
  const result = await withSpaceLock(clean, async () => {
    const normalized = ensureWelcomeMessagesForSpace(normalizeSpace(space));
    const { clients, messages, deletedClientIds: _d, cases: _cases, ...doc } = normalized;

    await prisma.space.upsert({
      where: { slug: clean },
      create: {
        slug: clean,
        data: serializeSpaceDoc(doc),
      },
      update: {
        data: serializeSpaceDoc(doc),
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
      const existingIds = new Set(existing.map((message) => message.id));
      const byId = new Map(existing.map((message) => [message.id, message]));
      for (const message of incoming) {
        if (!existingIds.has(message.id)) {
          newlyStored.push({ message, client });
          if (message.from === "client" && message.clientId === client.id) {
            pendingAutoAnswer.push({
              chatId: client.id,
              messageId: message.id,
            });
          }
        }
        byId.set(message.id, message);
      }
      await upsertChatRow(clean, client, sortMessages([...byId.values()]));
    }

    return (await dbGetSpace(clean)) ?? normalized;
  });
  const meta = await dbGetSpaceMeta(clean);
  const updatedAt = meta?.updatedAt ?? new Date().toISOString();
  const liveMessages = sortMessages(newlyStored.map((row) => row.message));
  for (const message of liveMessages) {
    const row = newlyStored.find((item) => item.message.id === message.id);
    if (!row) continue;
    emitSpaceEvent(clean, {
      type: "message",
      message,
      client: withoutAutoAnswerDraft(row.client),
      updatedAt,
    });
  }
  void notifySpaceListeners(clean);
  const latestByChat = new Map<string, string>();
  for (const item of pendingAutoAnswer) {
    latestByChat.set(item.chatId, item.messageId);
  }
  for (const [chatId, messageId] of latestByChat) {
    void runAutoAnswerJob(clean, chatId, messageId);
  }
  return result;
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
      data: { slug: clean, data: serializeSpaceDoc(doc) },
    });
    return assembleSpace(doc, [], [], []);
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
      data: serializeSpaceDoc(doc),
      ownerId: ownerId || null,
    },
  });
  return assembleSpace(doc, [], [], []);
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
