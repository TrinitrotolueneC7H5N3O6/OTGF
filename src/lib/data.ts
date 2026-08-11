import type { Artifact, LibraryCategory } from "./types";

/** Default library folders — Photos / Text / Link. */
export const defaultCategories: LibraryCategory[] = [
  { id: "cat-photos", name: "Photos" },
  { id: "cat-text", name: "Text" },
  { id: "cat-link", name: "Link" },
];

/** Legacy seed artifact ids — stripped on normalize so old spaces start empty. */
export const legacyDefaultArtifactIds = new Set([
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "a8",
]);

export const defaultArtifacts: Artifact[] = [];

/** @deprecated Inbox removed — dump area is not a folder. */
export const INBOX_CATEGORY_ID = "cat-inbox";
export const INBOX_CATEGORY_NAME = "Inbox";

/** Strip Inbox; seed Photos / Text / Link when the library has no folders. */
export function ensureInboxCategory(
  categories: LibraryCategory[],
): { categories: LibraryCategory[]; renamedFromId?: string } {
  const withoutInbox = categories.filter((c) => c.id !== INBOX_CATEGORY_ID);
  return {
    categories: withoutInbox.length
      ? withoutInbox
      : defaultCategories.map((c) => ({ ...c })),
  };
}

/**
 * Pick or create a folder name for an artifact from kind + meta/title.
 * Returns a short shop-facing folder label.
 */
export function suggestFolderName(item: {
  kind: string;
  title?: string;
  meta?: string;
  body?: string;
}): string {
  const hay = `${item.title ?? ""} ${item.meta ?? ""} ${item.body ?? ""}`
    .toLowerCase()
    .replace(/\s+/g, " ");

  const rules: { name: string; test: RegExp }[] = [
    { name: "Before / after", test: /before\s*\/?\s*after|transformation|makeover/i },
    { name: "Styles", test: /\b(style|hair|cut|color|balayage|blowout|fade|perm)\b/i },
    { name: "Dishes", test: /\b(dish|food|plate|meal|menu item|entree|dessert)\b/i },
    { name: "Menus", test: /\b(menu|price list|pricing)\b/i },
    { name: "Space", test: /\b(interior|exterior|shop|salon|studio|room|storefront)\b/i },
    { name: "Booking", test: /\b(book|appoint|reserv|schedule|calendly)\b/i },
    { name: "Hours", test: /\b(hours|open|closed|schedule|weekday)\b/i },
    { name: "Link", test: /\b(http|www\.|\.com|link|website|instagram|maps)\b/i },
  ];

  for (const rule of rules) {
    if (rule.test.test(hay)) return rule.name;
  }

  if (item.kind === "video") return "Videos";
  if (item.kind === "url") return "Link";
  if (item.kind === "text") return "Text";
  if (item.kind === "collection") return "Photos";
  return "Photos";
}

/** Assign artifacts into folders by suggestion, creating categories as needed. */
export function autoOrganizeLibrary(
  categories: LibraryCategory[],
  artifacts: Artifact[],
  options?: { createFolders?: boolean },
): { categories: LibraryCategory[]; artifacts: Artifact[] } {
  const createFolders = options?.createFolders !== false;
  const byName = new Map(
    categories
      .filter((c) => c.id !== INBOX_CATEGORY_ID)
      .map((c) => [c.name.trim().toLowerCase(), c] as const),
  );
  let nextCategories = [...byName.values()];
  let stamp = Date.now();

  function bestExisting(item: {
    kind: string;
    title?: string;
    meta?: string;
    body?: string;
  }): LibraryCategory | undefined {
    if (!nextCategories.length) return undefined;
    const suggested = suggestFolderName(item).toLowerCase();
    const exact = byName.get(suggested);
    if (exact) return exact;

    const hay = `${item.title ?? ""} ${item.meta ?? ""} ${item.body ?? ""} ${item.kind}`
      .toLowerCase();
    let best: { cat: LibraryCategory; score: number } | null = null;
    for (const cat of nextCategories) {
      const name = cat.name.trim().toLowerCase();
      let score = 0;
      if (hay.includes(name)) score += 3;
      for (const t of name.split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
        if (hay.includes(t)) score += 1;
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { cat, score };
      }
    }
    return best?.cat ?? nextCategories[0];
  }

  const nextArtifacts = artifacts.map((item) => {
    const folderName = suggestFolderName(item);
    const key = folderName.toLowerCase();
    let cat = byName.get(key);
    if (!cat) {
      if (!createFolders) {
        cat = bestExisting(item);
        if (!cat) return item;
      } else {
        cat = {
          id: `cat-${stamp++}-${Math.random().toString(36).slice(2, 5)}`,
          name: folderName,
        };
        byName.set(key, cat);
        nextCategories = [...nextCategories, cat];
      }
    }
    if (item.categoryId === cat.id) return item;
    return { ...item, categoryId: cat.id };
  });

  return { categories: nextCategories, artifacts: nextArtifacts };
}
