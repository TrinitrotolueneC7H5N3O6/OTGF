import type {
  Artifact,
  AutoAnswerDraft,
  BusinessSpace,
  Client,
  CustomerCase,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  Message,
  Offering,
  KnowledgeNote,
  ReceiptPayment,
  ReceiptProduct,
  CustomerCaseIdentifier,
  CustomerCaseStatus,
} from "./types";
import { withoutAutoAnswerDraft } from "./autoAnswer";

export type SpaceOp =
  | { type: "renameClient"; clientId: string; name: string }
  | { type: "deleteClient"; clientId: string }
  | { type: "endChat"; clientId: string; message: Message }
  | {
      type: "setOwner";
      clientId: string;
      ownerMemberId?: string | null;
    }
  | { type: "updateMembers"; members: FloorMember[] }
  | {
      type: "setLibrary";
      categories: LibraryCategory[];
      artifacts: Artifact[];
    }
  | { type: "setSettings"; settings: FloorSettings }
  | {
      type: "setReceipts";
      receiptPayments?: ReceiptPayment[];
      receiptProducts?: ReceiptProduct[];
    }
  | { type: "setOfferings"; offerings: Offering[] }
  | { type: "setKnowledgeNotes"; knowledgeNotes: KnowledgeNote[] }
  | { type: "createCase"; customerCase: CustomerCase }
  | { type: "updateCaseStatus"; caseId: string; status: CustomerCaseStatus }
  | { type: "updateCaseNotes"; caseId: string; notes: string }
  | {
      type: "updateCaseIdentifiers";
      caseId: string;
      identifiers: CustomerCaseIdentifier[];
    }
  | { type: "assignChatCase"; clientId: string; caseId?: string | null }
  | { type: "hideClient"; clientId: string; hidden?: boolean }
  | { type: "upsertClient"; client: Client; clearDeleted?: boolean }
  | {
      type: "setAutoAnswerDraft";
      clientId: string;
      draft: AutoAnswerDraft | null;
    }
  | { type: "setAutoAnswerOff"; clientId: string; off: boolean }
  | { type: "retryAutoAnswer"; clientId: string };

/** Ops customers must ignore so one chat's draft never lands in another tab. */
export function isStaffOnlySpaceOp(op: SpaceOp): boolean {
  return op.type === "setAutoAnswerDraft" || op.type === "retryAutoAnswer";
}

export function applySpaceOpToSpace(
  space: BusinessSpace,
  op: SpaceOp,
): BusinessSpace {
  switch (op.type) {
    case "renameClient":
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId ? { ...c, name: op.name } : c,
        ),
      };
    case "deleteClient":
      if (space.clients.some((c) => c.id === op.clientId && c.caseId)) {
        return {
          ...space,
          clients: space.clients.map((c) =>
            c.id === op.clientId ? { ...c, hiddenFromInbox: true } : c,
          ),
        };
      }
      return {
        ...space,
        deletedClientIds: [
          ...new Set([...(space.deletedClientIds ?? []), op.clientId]),
        ],
        clients: space.clients.filter((c) => c.id !== op.clientId),
        messages: space.messages.filter((m) => m.clientId !== op.clientId),
      };
    case "endChat": {
      if (space.messages.some((m) => m.id === op.message.id)) return space;
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId
            ? withoutAutoAnswerDraft({
                ...c,
                chatEndedAt: c.chatEndedAt || new Date().toISOString(),
                preview: "Chat ended",
                lastActive: "Just now",
                unread: 0,
              })
            : c,
        ),
        messages: [...space.messages, op.message],
      };
    }
    case "setOwner":
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId
            ? {
                ...c,
                ownerMemberId: op.ownerMemberId || undefined,
              }
            : c,
        ),
      };
    case "updateMembers": {
      const memberIds = new Set(op.members.map((m) => m.id));
      const soleOwnerId = op.members.length === 1 ? op.members[0]?.id : undefined;
      return {
        ...space,
        members: op.members,
        clients: space.clients.map((c) => ({
          ...c,
          ownerMemberId:
            c.ownerMemberId && memberIds.has(c.ownerMemberId)
              ? c.ownerMemberId
              : soleOwnerId,
        })),
      };
    }
    case "setLibrary":
      return {
        ...space,
        categories: op.categories,
        artifacts: op.artifacts,
      };
    case "setSettings":
      return { ...space, settings: op.settings };
    case "setReceipts":
      return {
        ...space,
        receiptPayments: op.receiptPayments ?? space.receiptPayments,
        receiptProducts: op.receiptProducts ?? space.receiptProducts,
      };
    case "setOfferings":
      return { ...space, offerings: op.offerings };
    case "setKnowledgeNotes":
      return { ...space, knowledgeNotes: op.knowledgeNotes };
    case "createCase":
      if (space.cases.some((item) => item.id === op.customerCase.id)) {
        return space;
      }
      return { ...space, cases: [...space.cases, op.customerCase] };
    case "updateCaseStatus":
      return {
        ...space,
        cases: space.cases.map((item) =>
          item.id === op.caseId ? { ...item, status: op.status } : item,
        ),
      };
    case "updateCaseNotes":
      return {
        ...space,
        cases: space.cases.map((item) =>
          item.id === op.caseId ? { ...item, notes: op.notes } : item,
        ),
      };
    case "updateCaseIdentifiers":
      return {
        ...space,
        cases: space.cases.map((item) =>
          item.id === op.caseId
            ? { ...item, identifiers: op.identifiers }
            : item,
        ),
      };
    case "assignChatCase":
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId
            ? {
                ...c,
                caseId: op.caseId || undefined,
                hiddenFromInbox: op.caseId ? c.hiddenFromInbox : false,
              }
            : c,
        ),
      };
    case "hideClient":
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId
            ? { ...c, hiddenFromInbox: op.hidden ?? true }
            : c,
        ),
      };
    case "upsertClient": {
      const existing = space.clients.some((c) => c.id === op.client.id);
      return {
        ...space,
        deletedClientIds: op.clearDeleted
          ? (space.deletedClientIds ?? []).filter((id) => id !== op.client.id)
          : space.deletedClientIds,
        clients: existing
          ? space.clients.map((c) => (c.id === op.client.id ? op.client : c))
          : [op.client, ...space.clients],
      };
    }
    case "setAutoAnswerDraft":
      return {
        ...space,
        clients: space.clients.map((c) => {
          if (c.id !== op.clientId) return c;
          return op.draft
            ? { ...c, autoAnswerDraft: op.draft }
            : withoutAutoAnswerDraft(c);
        }),
      };
    case "setAutoAnswerOff":
      return {
        ...space,
        clients: space.clients.map((c) =>
          c.id === op.clientId
            ? op.off
              ? { ...c, autoAnswerOff: true }
              : { ...c, autoAnswerOff: undefined }
            : c,
        ),
      };
    case "retryAutoAnswer":
      return {
        ...space,
        clients: space.clients.map((c) => {
          if (c.id !== op.clientId || !c.autoAnswerDraft) return c;
          const { error: _error, ...rest } = c.autoAnswerDraft;
          return {
            ...c,
            autoAnswerDraft: { ...rest, status: "working" as const },
          };
        }),
      };
    default:
      return space;
  }
}
