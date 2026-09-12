export const STORY_FORMATS = ["photo", "writing"] as const;
export type StoryFormat = (typeof STORY_FORMATS)[number];

export const STORY_VOICES = ["plain", "warm", "professional"] as const;
export type StoryVoice = (typeof STORY_VOICES)[number];

export const STORY_TITLE_STYLES = ["job", "customer", "problem"] as const;
export type StoryTitleStyle = (typeof STORY_TITLE_STYLES)[number];

export const STORY_PHOTO_STYLES = ["gallery", "beforeAfter"] as const;
export type StoryPhotoStyle = (typeof STORY_PHOTO_STYLES)[number];

export interface StorySectionTemplate {
  id: string;
  label: string;
  prompt: string;
  required: boolean;
}

export type StoryListLayout = "feed" | "grid" | "compact";
export type StoryOutput = "website" | "embed" | "carousel";

export interface StoryTemplate {
  listLayout: StoryListLayout;
  output: StoryOutput;
  format: StoryFormat;
  eyebrow: string;
  voice: StoryVoice;
  titleStyle: StoryTitleStyle;
  photoStyle: StoryPhotoStyle;
  showDate: boolean;
  searchPrompt: string;
  sections: StorySectionTemplate[];
}

const SECTION_ID = /^[a-z][a-z0-9-]{0,31}$/;

export function isPhotoStory(template: StoryTemplate) {
  return template.format === "photo";
}

export function storyTemplateForFormat(format: StoryFormat): StoryTemplate {
  if (format === "photo") {
    return {
      listLayout: "feed",
      output: "website",
      format: "photo",
      eyebrow: "From the job",
      voice: "plain",
      titleStyle: "job",
      photoStyle: "beforeAfter",
      showDate: true,
      searchPrompt: "Search jobs like yours — leak, AC, kitchen, no heat…",
      sections: [
        {
          id: "caption",
          label: "What happened",
          prompt: "A few sentences: what was wrong, what you did, how it turned out.",
          required: true,
        },
      ],
    };
  }
  return {
    listLayout: "feed",
    output: "website",
    format: "writing",
    eyebrow: "A story of our work",
    voice: "plain",
    titleStyle: "job",
    photoStyle: "gallery",
    showDate: true,
    searchPrompt: "Search work like yours — contract, dispute, closing…",
    sections: [
      {
        id: "situation",
        label: "The situation",
        prompt: "What was going on before you started? Write it the way you'd tell a neighbor.",
        required: true,
      },
      {
        id: "work",
        label: "What we did",
        prompt: "What work did you actually do? Skip jargon. Name the parts and the steps that mattered.",
        required: true,
      },
      {
        id: "result",
        label: "How it turned out",
        prompt: "What changed for them? How do they use the space or system now?",
        required: true,
      },
    ],
  };
}

export function defaultStoryTemplate(): StoryTemplate {
  return storyTemplateForFormat("writing");
}

export function titleStyleHint(style: StoryTitleStyle) {
  if (style === "customer") {
    return "Name who it was for, in a few words. Example: The Chen family's kitchen leak.";
  }
  if (style === "problem") {
    return "Name the problem you solved. Example: No heat before a holiday weekend.";
  }
  return "Name the job in plain words. Example: Replaced the upstairs AC.";
}

export function voiceHint(voice: StoryVoice) {
  if (voice === "warm") {
    return "Friendly and human. Good if you talk like a neighbor who showed up to help.";
  }
  if (voice === "professional") {
    return "Clear and calm. Good if you want these to read like case notes, not ads.";
  }
  return "Straight and simple. No extra flourish — just what happened.";
}

export function voiceOpener(voice: StoryVoice) {
  if (voice === "warm") {
    return "Every job starts as a real problem for someone. This is how this one went.";
  }
  if (voice === "professional") {
    return "A short record of the request, the work completed, and the result.";
  }
  return "";
}

export function newStorySection(): StorySectionTemplate {
  return {
    id: `part-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    prompt: "",
    required: false,
  };
}

export function normalizeStoryTemplate(raw: unknown): StoryTemplate {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const format = STORY_FORMATS.includes(input.format as StoryFormat)
    ? (input.format as StoryFormat)
    : "writing";
  const fallback = storyTemplateForFormat(format);
  if (!raw || typeof raw !== "object") return fallback;
  const sections: StorySectionTemplate[] = [];
  const seen = new Set<string>();
  const source = Array.isArray(input.sections) ? input.sections : fallback.sections;
  const maxSections = format === "photo" ? 3 : 5;
  const minSections = format === "photo" ? 1 : 2;
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    let id = typeof row.id === "string" ? row.id.trim().toLowerCase() : "";
    if (!SECTION_ID.test(id)) id = `part-${sections.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
    const prompt = typeof row.prompt === "string" ? row.prompt.trim().slice(0, 400) : "";
    sections.push({
      id,
      label: label || `Part ${sections.length + 1}`,
      prompt,
      required: row.required !== false,
    });
    if (sections.length >= maxSections) break;
  }
  if (sections.length < minSections) sections.splice(0, sections.length, ...fallback.sections);
  const voice = STORY_VOICES.includes(input.voice as StoryVoice)
    ? (input.voice as StoryVoice)
    : fallback.voice;
  const titleStyle = STORY_TITLE_STYLES.includes(input.titleStyle as StoryTitleStyle)
    ? (input.titleStyle as StoryTitleStyle)
    : fallback.titleStyle;
  const photoStyle = STORY_PHOTO_STYLES.includes(input.photoStyle as StoryPhotoStyle)
    ? (input.photoStyle as StoryPhotoStyle)
    : fallback.photoStyle;
  const eyebrow = typeof input.eyebrow === "string" ? input.eyebrow.trim().slice(0, 80) : "";
  const searchPrompt = typeof input.searchPrompt === "string"
    ? input.searchPrompt.trim().slice(0, 120)
    : "";
  return {
    listLayout: input.listLayout === "grid" || input.listLayout === "compact" ? input.listLayout : "feed",
    output: input.output === "embed" || input.output === "carousel" ? input.output : "website",
    format,
    eyebrow: eyebrow || fallback.eyebrow,
    voice,
    titleStyle,
    photoStyle,
    showDate: input.showDate !== false,
    searchPrompt: searchPrompt || fallback.searchPrompt,
    sections,
  };
}

export function chaptersFromLegacy(challenge: string, process: string, outcome: string): Record<string, string> {
  return {
    situation: challenge,
    work: process,
    result: outcome,
  };
}

export function storyChapters(
  chapters: Record<string, string> | undefined,
  challenge: string,
  process: string,
  outcome: string,
) {
  if (chapters && Object.keys(chapters).length) return chapters;
  return chaptersFromLegacy(challenge, process, outcome);
}

export function requiredChaptersFilled(
  template: StoryTemplate,
  chapters: Record<string, string>,
) {
  return template.sections
    .filter((section) => section.required)
    .every((section) => Boolean(chapters[section.id]?.trim()));
}

export function storyDateLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(year, month - 1, day));
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function storyHaystack(input: {
  title: string;
  description: string;
  tags: string[];
  chapters: Record<string, string>;
}) {
  return [input.title, input.description, input.tags.join(" "), ...Object.values(input.chapters)]
    .join(" ")
    .toLowerCase();
}

export function matchStorySearch(
  haystack: string,
  query: string,
) {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
  if (!terms.length) return true;
  return terms.every((term) => haystack.includes(term));
}

export function storyExcerpt(chapters: Record<string, string>, template: StoryTemplate, description = "") {
  const first = template.sections
    .map((section) => chapters[section.id]?.trim() ?? "")
    .find(Boolean);
  const source = (first || description).replace(/\s+/g, " ").trim();
  if (source.length <= 160) return source;
  return `${source.slice(0, 157).trim()}…`;
}

export function storyCaption(chapters: Record<string, string>, description = "") {
  const caption = (chapters.caption || description).replace(/\s+/g, " ").trim();
  if (caption) return caption;
  return ["situation", "work", "result"]
    .map((id) => chapters[id]?.trim())
    .filter(Boolean)
    .join(" ");
}

export function storyTitleFromCaption(caption: string) {
  const line = caption.split(/[.!?]/)[0]?.trim() || caption;
  if (line.length <= 80) return line;
  return `${line.slice(0, 77).trim()}…`;
}

export function sampleStoryChapters(template: StoryTemplate): Record<string, string> {
  const samples: Record<string, string> = {
    caption: "The upstairs rooms were blowing warm air. We replaced the capacitor and flushed the drain. The house holds 72° on a 95° day.",
    situation: "The upstairs rooms were blowing warm air in July. They had been turning the system off at night to save money, then waking up hot.",
    work: "We found a failed capacitor and a clogged drain. We replaced the part, flushed the line, and showed them the filter schedule on the closet door.",
    result: "The house holds 72° on a 95° day. They sleep through the night and stopped buying window units.",
  };
  const next: Record<string, string> = {};
  template.sections.forEach((section, index) => {
    next[section.id] = samples[section.id] ?? `This is where you write part ${index + 1} in everyday words.`;
  });
  return next;
}

export interface StoryStyleTemplate {
  id: string;
  name: string;
  blurb: string;
  meta: string;
  template: StoryTemplate;
}

const photoStyleBase = storyTemplateForFormat("photo");
const writingStyleBase = storyTemplateForFormat("writing");

export const STORY_STYLE_TEMPLATES: StoryStyleTemplate[] = [
  {
    id: "before-after",
    name: "Before & after",
    blurb: "Side-by-side job photos. Customers drag to compare.",
    meta: "Photo · Cover grid",
    template: { ...photoStyleBase, listLayout: "grid", photoStyle: "beforeAfter", titleStyle: "job", voice: "plain" },
  },
  {
    id: "photo-feed",
    name: "Photo feed",
    blurb: "Roomy posts with a gallery. Good when each job has several shots.",
    meta: "Photo · Social feed",
    template: { ...photoStyleBase, listLayout: "feed", photoStyle: "gallery", titleStyle: "job", voice: "plain", eyebrow: "Recent work" },
  },
  {
    id: "job-list",
    name: "Job list",
    blurb: "A tight list of finished jobs. Fast to scan on a phone.",
    meta: "Photo · Compact list",
    template: {
      ...photoStyleBase,
      listLayout: "compact",
      photoStyle: "gallery",
      titleStyle: "problem",
      voice: "plain",
      searchPrompt: "Search a job — leak, AC, no heat…",
    },
  },
  {
    id: "written-cases",
    name: "Written cases",
    blurb: "Situation, work, result. A one-page writeup with photos optional.",
    meta: "Writing · Social feed",
    template: { ...writingStyleBase, listLayout: "feed", photoStyle: "gallery", titleStyle: "job", voice: "plain" },
  },
  {
    id: "client-stories",
    name: "Client stories",
    blurb: "Named for the person. Warm voice, good for homes and families.",
    meta: "Writing · Cover grid",
    template: {
      ...writingStyleBase,
      listLayout: "grid",
      photoStyle: "gallery",
      titleStyle: "customer",
      voice: "warm",
      eyebrow: "Client stories",
    },
  },
  {
    id: "case-notes",
    name: "Case notes",
    blurb: "Calm and compact. Reads like a short record, not an ad.",
    meta: "Writing · Compact list",
    template: {
      ...writingStyleBase,
      listLayout: "compact",
      photoStyle: "gallery",
      titleStyle: "problem",
      voice: "professional",
      eyebrow: "Case notes",
    },
  },
];

export function applyStoryStyleTemplate(current: StoryTemplate, id: string): StoryTemplate | null {
  const preset = STORY_STYLE_TEMPLATES.find((item) => item.id === id);
  if (!preset) return null;
  return normalizeStoryTemplate({ ...preset.template, output: current.output });
}

export function matchingStoryStyleId(template: StoryTemplate): string {
  const match = STORY_STYLE_TEMPLATES.find((item) =>
    item.template.format === template.format &&
    item.template.photoStyle === template.photoStyle &&
    item.template.listLayout === template.listLayout &&
    item.template.titleStyle === template.titleStyle &&
    item.template.voice === template.voice
  );
  return match?.id ?? "";
}
