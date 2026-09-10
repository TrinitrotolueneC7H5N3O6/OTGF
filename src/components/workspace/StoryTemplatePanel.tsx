"use client";

import { SettingsEditorHeader } from "./SettingsEditorHeader";
import { PreviewFrame } from "./PreviewFrame";
import { GrowthStory } from "@/components/client/GrowthPublicApp";
import type { FloorSettings } from "@/lib/types";
import {
  STORY_PHOTO_STYLES,
  STORY_TITLE_STYLES,
  STORY_VOICES,
  defaultStoryTemplate,
  newStorySection,
  normalizeStoryTemplate,
  sampleStoryChapters,
  titleStyleHint,
  voiceHint,
  voiceOpener,
  type StoryPhotoStyle,
  type StoryTemplate,
  type StoryTitleStyle,
  type StoryVoice,
} from "@/lib/storytelling";

export function StoryTemplatePanel({
  settings,
  onChangeSettings,
}: {
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}) {
  const template = normalizeStoryTemplate(settings.storyTemplate);

  function patch(next: Partial<StoryTemplate>) {
    onChangeSettings({
      ...settings,
      storyTemplate: normalizeStoryTemplate({ ...template, ...next }),
    });
  }

  function patchSection(index: number, next: Partial<StoryTemplate["sections"][number]>) {
    const sections = template.sections.map((section, i) => (i === index ? { ...section, ...next } : section));
    patch({ sections });
  }

  const sampleChapters = sampleStoryChapters(template);
  const sampleTitle = template.titleStyle === "customer"
    ? "The Chen family's kitchen leak"
    : template.titleStyle === "problem"
      ? "No heat before a holiday weekend"
      : "Replaced the upstairs AC";

  return (
    <div className="forms-manager-shell">
      <div className="dashboard-panel-body forms-manager">
        <SettingsEditorHeader
          title="Storytelling"
          description="Set the shape of every story so you don't have to invent the writing from scratch. Owners fill in what happened; customers read a finished case."
        />
        <section className="settings-editor-card growth-editor">
          <h3>How stories should feel</h3>
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
                  {style === "job" ? "Name the job" : style === "customer" ? "Name who it was for" : "Name the problem you solved"}
                </option>
              ))}
            </select>
          </label>
          <p className="floor-settings-help">{titleStyleHint(template.titleStyle)}</p>
          <label className="floor-settings-note">
            <span>Photos</span>
            <select value={template.photoStyle} onChange={(e) => patch({ photoStyle: e.target.value as StoryPhotoStyle })}>
              {STORY_PHOTO_STYLES.map((style) => (
                <option key={style} value={style}>{style === "beforeAfter" ? "Before and after pair" : "Photo gallery"}</option>
              ))}
            </select>
          </label>
          <label className="floor-settings-note story-check">
            <input type="checkbox" checked={template.showDate} onChange={(e) => patch({ showDate: e.target.checked })} />
            <span>Show the job date on published stories</span>
          </label>
        </section>
        <section className="settings-editor-card growth-editor">
          <h3>The parts you fill in</h3>
          <p className="floor-settings-help">Each part becomes a heading customers see. The prompt is the reminder you get when writing — keep it specific enough that a tired owner can answer it.</p>
          {template.sections.map((section, index) => (
            <div key={section.id} className="story-template-section">
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
              <label className="floor-settings-note">
                <span>Prompt for you</span>
                <textarea rows={2} maxLength={400} value={section.prompt} onChange={(e) => patchSection(index, { prompt: e.target.value })} />
              </label>
              {template.sections.length > 2 ? (
                <button type="button" className="btn-ghost" onClick={() => patch({ sections: template.sections.filter((_, i) => i !== index) })}>Remove this part</button>
              ) : null}
            </div>
          ))}
          {template.sections.length < 5 ? (
            <button type="button" className="btn-solid" onClick={() => patch({ sections: [...template.sections, newStorySection()] })}>Add another part</button>
          ) : null}
        </section>
        <section className="settings-editor-card growth-editor">
          <h3>Customer search</h3>
          <label className="floor-settings-note">
            <span>Search hint on your public stories page</span>
            <input value={template.searchPrompt} maxLength={120} onChange={(e) => patch({ searchPrompt: e.target.value })} />
          </label>
          <p className="floor-settings-help">People type the problem they have. Keywords you add on each story are what this search matches.</p>
        </section>
        <p className="floor-settings-help">
          <button type="button" className="btn-ghost" onClick={() => patch(defaultStoryTemplate())}>Reset to the starter template</button>
        </p>
      </div>
      <PreviewFrame help="A sample story using this template. Real jobs are written under Stories." onRestart={() => undefined}>
        <div className="growth-preview-content story-preview-frame">
          <GrowthStory
            data={{
              title: sampleTitle,
              description: voiceOpener(template.voice),
              date: "2026-06-12",
              photos: [],
              tags: ["ac", "no cooling"],
              chapters: sampleChapters,
            }}
            template={template}
          />
        </div>
      </PreviewFrame>
    </div>
  );
}
