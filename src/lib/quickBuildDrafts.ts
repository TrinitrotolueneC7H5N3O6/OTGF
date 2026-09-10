const QUICK_BUILD_DRAFT_PREFIX = "otgf:quick-build-draft:";
const QUICK_BUILD_DRAFT_VERSION = 1;
const QUICK_BUILD_DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

type StoredQuickBuildDraft = {
  version: typeof QUICK_BUILD_DRAFT_VERSION;
  updatedAt: number;
  values: Record<string, string>;
};

function quickBuildDraftKey(slug: string, actionId: string) {
  return `${QUICK_BUILD_DRAFT_PREFIX}${encodeURIComponent(slug)}:${encodeURIComponent(actionId)}`;
}

function cleanValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) => key.length > 0 && typeof value === "string" && value.length > 0,
    ),
  );
}

export function recallQuickBuildDraft(slug: string, actionId: string) {
  try {
    const key = quickBuildDraftKey(slug, actionId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Partial<StoredQuickBuildDraft>;
    const valid =
      parsed.version === QUICK_BUILD_DRAFT_VERSION &&
      typeof parsed.updatedAt === "number" &&
      Date.now() - parsed.updatedAt <= QUICK_BUILD_DRAFT_MAX_AGE &&
      parsed.values !== null &&
      typeof parsed.values === "object" &&
      !Array.isArray(parsed.values) &&
      Object.values(parsed.values).every((value) => typeof value === "string");

    if (!valid) {
      localStorage.removeItem(key);
      return {};
    }

    return cleanValues(parsed.values as Record<string, string>);
  } catch {
    return {};
  }
}

export function rememberQuickBuildDraft(
  slug: string,
  actionId: string,
  values: Record<string, string>,
) {
  try {
    const key = quickBuildDraftKey(slug, actionId);
    const cleaned = cleanValues(values);
    if (Object.keys(cleaned).length === 0) {
      localStorage.removeItem(key);
      return;
    }

    const draft: StoredQuickBuildDraft = {
      version: QUICK_BUILD_DRAFT_VERSION,
      updatedAt: Date.now(),
      values: cleaned,
    };
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage can be unavailable in private browsing or blocked third-party iframes.
  }
}

export function forgetQuickBuildDraft(slug: string, actionId: string) {
  try {
    localStorage.removeItem(quickBuildDraftKey(slug, actionId));
  } catch {
    // Ignore unavailable storage.
  }
}
