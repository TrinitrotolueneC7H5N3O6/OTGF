import type {
  Artifact,
  BusinessSpace,
  Client,
  FloorMember,
  FloorSettings,
  LibraryCategory,
  Message,
  ReceiptPayment,
  ReceiptProduct,
} from "./types";

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
  | { type: "upsertClient"; client: Client; clearDeleted?: boolean };

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
            ? {
                ...c,
                chatEndedAt: c.chatEndedAt || new Date().toISOString(),
                preview: "Chat ended",
                lastActive: "Just now",
                unread: 0,
              }
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
    default:
      return space;
  }
}
