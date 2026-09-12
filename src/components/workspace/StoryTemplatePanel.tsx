"use client";

import { PreviewFrame } from "./PreviewFrame";
import { GrowthStory } from "@/components/client/StoryPresentation";
import { StoriesCollection, type BrowseStory } from "@/components/client/StoriesBrowseApp";
import styles from "./StoryTemplatePanel.module.css";
import { useState } from "react";
import type { FloorSettings } from "@/lib/types";
import {
  STORY_PHOTO_STYLES,
  STORY_TITLE_STYLES,
  STORY_VOICES,
  isPhotoStory,
  newStorySection,
  normalizeStoryTemplate,
  sampleStoryChapters,
  storyTemplateForFormat,
  titleStyleHint,
  voiceHint,
  voiceOpener,
  applyStoryStyleTemplate,
  matchingStoryStyleId,
  STORY_STYLE_TEMPLATES,
  type StoryFormat,
  type StoryPhotoStyle,
  type StoryTemplate,
  type StoryTitleStyle,
  type StoryVoice,
} from "@/lib/storytelling";
import { ToolTemplates } from "./ToolTemplates";

export function StoryTemplatePanel({
  slug,
  settings,
  onChangeSettings,
}: {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}) {
  const [pane, setPane] = useState<"templates" | "list" | "story" | "output">("templates");
  const [previewKey, setPreviewKey] = useState(0);
  const [notice, setNotice] = useState("");
  const [outputText, setOutputText] = useState("");
  const template = normalizeStoryTemplate(settings.storyTemplate);
  const photo = isPhotoStory(template);

  function patch(next: Partial<StoryTemplate>) {
    onChangeSettings({
      ...settings,
      storyTemplate: normalizeStoryTemplate({ ...template, ...next }),
    });
  }

  function chooseFormat(format: StoryFormat) {
    if (format === template.format) return;
    onChangeSettings({
      ...settings,
      storyTemplate: { ...storyTemplateForFormat(format), listLayout: template.listLayout, output: template.output, searchPrompt: template.searchPrompt, showDate: template.showDate },
    });
  }

  function patchSection(index: number, next: Partial<StoryTemplate["sections"][number]>) {
    const sections = template.sections.map((section, i) => (i === index ? { ...section, ...next } : section));
    patch({ sections });
  }

  function chooseStyle(id: string) {
    const next = applyStoryStyleTemplate(template, id);
    if (!next) return;
    onChangeSettings({ ...settings, storyTemplate: next });
    setNotice(`Applied ${STORY_STYLE_TEMPLATES.find((item) => item.id === id)?.name ?? "template"}.`);
    setPreviewKey((key) => key + 1);
  }

  const sampleChapters = sampleStoryChapters(template);
  const sampleTitle = photo
    ? "Replaced the upstairs AC"
    : template.titleStyle === "customer"
      ? "The Chen family's kitchen leak"
      : template.titleStyle === "problem"
        ? "No heat before a holiday weekend"
        : "Replaced the upstairs AC";
  const tabs = [["templates", "Templates"], ["list", "Story listing"], ["story", "Story format"], ["output", "Output"]] as const;
  const outputPath = `/${encodeURIComponent(slug)}/stories${template.output === "website" ? "" : `?output=${template.output}`}`;
  const sampleStories: BrowseStory[] = [sampleTitle, "A small fix, a big difference", "Another look at our work"].map((title, index) => ({
    id: `preview-${index}`, title, date: "2026-06-12", photos: ["/story-example-before.svg", "/story-example-after.svg"], photo: "/story-example-before.svg",
    tags: ["recent work", index === 0 ? "ac" : "maintenance"], excerpt: sampleChapters.caption || "What happened, how we helped, and the result.",
    description: photo ? sampleChapters.caption ?? "" : voiceOpener(template.voice), chapters: sampleChapters, challenge: "", process: "", outcome: "",
  }));

  async function copyOutput() {
    const url = `${window.location.origin}${outputPath}`;
    const text = template.output === "website" ? url : `<iframe src="${url}" title="Our work" width="100%" height="720" style="border:0;border-radius:16px" loading="lazy"></iframe>`;
    setOutputText(text);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(template.output === "website" ? "Website link copied." : "Embed code copied.");
    } catch {
      setNotice("Could not copy automatically. Select and copy the output below.");
    }
  }

  return (
    <div className="forms-manager-shell schedule-settings">
      <div className="dashboard-panel-body forms-manager">
        <section className="schedule-settings-editor" aria-label="Story template">
          <div className="schedule-settings-editor-bar">
            <nav className="schedule-settings-toc" aria-label="Story settings">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={pane === id ? "is-active" : undefined}
                  aria-current={pane === id ? "page" : undefined}
                  onClick={() => setPane(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="schedule-settings-editor-scroll">
        {pane === "templates" ? (
          <ToolTemplates
            help="Pick a style to set listing, photos, and writing in one step. You can still tweak Story listing and Story format after."
            selectedId={matchingStoryStyleId(template)}
            templates={STORY_STYLE_TEMPLATES.map((item) => ({
              id: item.id,
              name: item.name,
              blurb: item.blurb,
              meta: item.meta,
            }))}
            onPick={chooseStyle}
          />
        ) : null}
        {pane === "templates" && notice ? <p role="status" className="floor-settings-help">{notice}</p> : null}
        {pane === "story" ? (
        <section className="settings-editor-card growth-editor">
          <h3>What kind of stories are these?</h3>
          <p className="floor-settings-help">Choose the layout and writing format used when someone opens a story. This applies to published stories and the writing prompts for new posts.</p>
          <div className="schedule-choice-cards">
            <button type="button" className={photo ? "is-active" : undefined} aria-pressed={photo} onClick={() => chooseFormat("photo")}>
              <strong>Photo stories</strong>
              <span>Trades, shops, site work. A headline, short introduction, and an interactive photo gallery.</span>
            </button>
            <button type="button" className={!photo ? "is-active" : undefined} aria-pressed={!photo} onClick={() => chooseFormat("writing")}>
              <strong>Written cases</strong>
              <span>Law, advisory, longer work. A one-page writeup: what happened, what you did, how it turned out. Photos optional.</span>
            </button>
          </div>
          {photo ? (
            <>
              <label className="floor-settings-note">
                <span>Photos</span>
                <select value={template.photoStyle} onChange={(e) => patch({ photoStyle: e.target.value as StoryPhotoStyle })}>
                  {STORY_PHOTO_STYLES.map((style) => (
                    <option key={style} value={style}>{style === "beforeAfter" ? "Before and after pair" : "Photo gallery"}</option>
                  ))}
                </select>
              </label>
              <label className="floor-settings-note">
                <span>Label above the story</span>
                <input value={template.eyebrow} maxLength={80} onChange={(e) => patch({ eyebrow: e.target.value })} />
              </label>
              <label className="floor-settings-note story-check">
                <input type="checkbox" checked={template.showDate} onChange={(e) => patch({ showDate: e.target.checked })} />
                <span>Show the job date</span>
              </label>
            </>
          ) : (
            <>
              <label className="floor-settings-note">
                <span>Voice</span>
                <select value={template.voice} onChange={(e) => patch({ voice: e.target.value as StoryVoice })}>
                  {STORY_VOICES.map((voice) => (
                    <option key={voice} value={voice}>{voice === "plain" ? "Plain" : voice === "warm" ? "Warm" : "Professional"}</option>
                  ))}
                </select>
              </label>
              <p className="floor-settings-help">{voiceHint(template.voice)}</p>
              <label className="floor-settings-note">
                <span>Label above the title</span>
                <input value={template.eyebrow} maxLength={80} onChange={(e) => patch({ eyebrow: e.target.value })} />
              </label>
              <label className="floor-settings-note">
                <span>How to name a story</span>
                <select value={template.titleStyle} onChange={(e) => patch({ titleStyle: e.target.value as StoryTitleStyle })}>
                  {STORY_TITLE_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style === "job" ? "Name the work" : style === "customer" ? "Name who it was for" : "Name the problem you solved"}
                    </option>
                  ))}
                </select>
              </label>
              <p className="floor-settings-help">{titleStyleHint(template.titleStyle)}</p>
              <label className="floor-settings-note">
                <span>Photos</span>
                <select value={template.photoStyle} onChange={(e) => patch({ photoStyle: e.target.value as StoryPhotoStyle })}>
                  {STORY_PHOTO_STYLES.map((style) => (
                    <option key={style} value={style}>{style === "beforeAfter" ? "Before and after pair" : "Optional gallery"}</option>
                  ))}
                </select>
              </label>
              <label className="floor-settings-note story-check">
                <input type="checkbox" checked={template.showDate} onChange={(e) => patch({ showDate: e.target.checked })} />
                <span>Show the date on published stories</span>
              </label>
            </>
          )}
        </section>
        ) : null}
        {pane === "story" ? (
        <section className="settings-editor-card growth-editor">
          <h3>{photo ? "The caption" : "The parts you fill in"}</h3>
          <p className="floor-settings-help">
            {photo
              ? "This is the only writing required. Keep it to a few sentences — what was wrong and what you did."
              : "Each part becomes a heading customers see. Aim for a one-pager, not an essay. The prompt is the reminder you get when writing."}
          </p>
          {template.sections.map((section, index) => (
            <div key={section.id} className="story-template-section">
              {photo ? null : (
                <div className="quick-build-customer-grid">
                  <label className="floor-settings-note">
                    <span>Heading customers see</span>
                    <input value={section.label} maxLength={80} onChange={(e) => patchSection(index, { label: e.target.value })} />
                  </label>
                  <label className="floor-settings-note">
                    <span>Required?</span>
                    <select value={section.required ? "yes" : "no"} onChange={(e) => patchSection(index, { required: e.target.value === "yes" })}>
                      <option value="yes">Yes — needed to publish</option>
                      <option value="no">Optional</option>
                    </select>
                  </label>
                </div>
              )}
              <label className="floor-settings-note">
                <span>{photo ? "Prompt when you write" : "Prompt for you"}</span>
                <textarea rows={2} maxLength={400} value={section.prompt} onChange={(e) => patchSection(index, { prompt: e.target.value })} />
              </label>
              {!photo && template.sections.length > 2 ? (
                <button type="button" className="btn-ghost" onClick={() => patch({ sections: template.sections.filter((_, i) => i !== index) })}>Remove this part</button>
              ) : null}
            </div>
          ))}
          {!photo && template.sections.length < 5 ? (
            <button type="button" className="btn-solid" onClick={() => patch({ sections: [...template.sections, newStorySection()] })}>Add another part</button>
          ) : null}
        </section>
        ) : null}
        {pane === "list" ? (
        <section className="settings-editor-card growth-editor">
          <h3>How should your stories be listed?</h3>
          <p className="floor-settings-help">This controls the collection. Opening any card uses the layout in Story format.</p>
          <div className="schedule-choice-cards">
            {([ ["feed", "Social feed", "Roomy posts with photos, headlines, and a short introduction."], ["grid", "Cover grid", "A gallery of cards that makes more of your work visible at once."], ["compact", "Compact list", "Smaller thumbnails and concise rows for quick browsing."] ] as const).map(([value, title, description]) => (
              <button type="button" key={value} className={template.listLayout === value ? "is-active" : undefined} aria-pressed={template.listLayout === value} onClick={() => patch({ listLayout: value })}><strong>{title}</strong><span>{description}</span></button>
            ))}
          </div>
          <h3>Customer search</h3>
          <label className="floor-settings-note">
            <span>Search hint on your public stories page</span>
            <input value={template.searchPrompt} maxLength={120} onChange={(e) => patch({ searchPrompt: e.target.value })} />
          </label>
          <p className="floor-settings-help">People type the problem they have. Keywords you add on each story are what this search matches.</p>
        </section>
        ) : null}
        {pane === "output" ? <section className="settings-editor-card growth-editor">
          <h3>Where will people see your work?</h3>
          <p className="floor-settings-help">Choose an output to preview and share. All three use the same published stories and story format.</p>
          <div className="schedule-choice-cards">
            {([ ["website", "Individual website", "A standalone stories page with your chosen list layout."], ["embed", "Website embed", "Place the same story collection inside an existing website."], ["carousel", "Cover carousel", "A horizontal showcase of your work, like a testimonial carousel. Each cover opens the full story."] ] as const).map(([value, title, description]) => (
              <button type="button" key={value} className={template.output === value ? "is-active" : undefined} aria-pressed={template.output === value} onClick={() => { patch({ output: value }); setNotice(""); setOutputText(""); }}><strong>{title}</strong><span>{description}</span></button>
            ))}
          </div>
          {template.output === "carousel" ? <p className="floor-settings-help">The carousel uses cover cards. Your website and regular embed keep the list layout selected in Story listing.</p> : null}
          <div className={styles.outputActions}>
            <a className="btn-ghost" href={outputPath} target="_blank" rel="noreferrer">Open published output ↗</a>
            <button type="button" className="btn-solid" onClick={copyOutput}>{template.output === "website" ? "Copy website link" : "Copy embed code"}</button>
          </div>
          <p className="floor-settings-help">Changes save automatically. The preview uses examples; shared outputs show your published stories.</p>
          {outputText ? <label className="floor-settings-note"><span>Share output</span><textarea readOnly rows={4} value={outputText} onFocus={(event) => event.target.select()} /></label> : null}
          <p role="status" className="floor-settings-help">{notice}</p>
        </section> : null}
          </div>
        </section>
      </div>
      <PreviewFrame onRestart={() => setPreviewKey((key) => key + 1)}>
        <div className={styles.preview} key={`${previewKey}-${pane}`}>
          {pane === "story" ? <GrowthStory data={sampleStories[0]} publication="Your business" template={template} /> : <StoriesCollection slug={slug} business="Your business" template={template} stories={sampleStories} embedded={pane !== "output" || template.output !== "website"} output={pane === "output" ? template.output : "website"} />}
        </div>
      </PreviewFrame>
    </div>
  );
}
