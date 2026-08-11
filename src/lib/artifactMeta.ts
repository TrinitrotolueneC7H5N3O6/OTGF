/** Cap for stored / Assist-facing artifact meta (token budget). */
export const ARTIFACT_META_MAX = 120;

export type ArtifactCatalogItem = {
  id: string;
  kind: string;
  title: string;
  meta?: string;
};

/** Compact library lines for Assist prompts — quality signal, low tokens. */
export function formatArtifactCatalog(
  items: ArtifactCatalogItem[] | undefined | null,
  limit = 10,
) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "";

  const ranked = [...list].sort((a, b) => {
    const am = a.meta?.trim() ? 1 : 0;
    const bm = b.meta?.trim() ? 1 : 0;
    return bm - am;
  });

  return ranked
    .slice(0, limit)
    .map((a) => {
      const label = (a.title || a.kind).trim().slice(0, 40);
      const note = (a.meta || "").trim().slice(0, ARTIFACT_META_MAX);
      return note
        ? `- ${a.kind} "${label}": ${note}`
        : `- ${a.kind} "${label}"`;
    })
    .join("\n");
}

export function clampArtifactMeta(raw: unknown) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, ARTIFACT_META_MAX);
}
