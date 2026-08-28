import type { Offering, OfferingKind } from "./types";

export function newOfferingId() {
  return `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function offeringAskPath(slug: string, offeringId: string) {
  return `/${slug}/ask/${encodeURIComponent(offeringId)}`;
}

export function inquireMessageId(chatId: string, offeringId: string) {
  return `m-ask-${chatId}-${offeringId}`;
}

export function inquireMessageBody(offering: Offering) {
  const kindLabel = offering.kind === "product" ? "product" : "service";
  const title = offering.title.trim() || "this offering";
  const lines = [`I'm interested in this ${kindLabel}: ${title}`];
  const price = offering.price.trim();
  const description = offering.description.trim();
  if (price) lines.push(price);
  if (description) lines.push(description);
  return lines.join("\n");
}

export function normalizeOfferingKind(raw: unknown): OfferingKind {
  return raw === "product" ? "product" : "service";
}

export function normalizeOfferings(raw: unknown): Offering[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const item = row as Partial<Offering>;
      const trimmedTitle =
        typeof item.title === "string" ? item.title.trim().slice(0, 80) : "";
      const id =
        typeof item.id === "string" && item.id.trim()
          ? item.id.trim()
          : "";
      const title = trimmedTitle || (id ? "Untitled" : "");
      if (!title) return null;
      const description =
        typeof item.description === "string"
          ? item.description.trim().slice(0, 500)
          : "";
      const price =
        typeof item.price === "string" ? item.price.trim().slice(0, 40) : "";
      const imageUrl =
        typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
      const sortOrder =
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : index;
      return {
        id: id || newOfferingId(),
        title,
        description,
        price,
        kind: normalizeOfferingKind(item.kind),
        ...(imageUrl ? { imageUrl } : {}),
        sortOrder,
      } satisfies Offering;
    })
    .filter((item): item is Offering => Boolean(item));
}

/** Compact catalog for an AI prompt — shared business facts, not customer data. */
export function formatOfferingsForPrompt(offerings: Offering[]) {
  if (!offerings.length) return "";
  const lines = offerings
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const bits = [
        item.kind === "product" ? "product" : "service",
        item.title,
      ];
      if (item.price.trim()) bits.push(item.price.trim());
      if (item.description.trim()) bits.push(item.description.trim());
      return `- ${bits.join(" — ")}`;
    });
  return `What this business offers:\n${lines.join("\n")}`;
}
