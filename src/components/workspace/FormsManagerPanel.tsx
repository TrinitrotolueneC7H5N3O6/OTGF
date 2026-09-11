"use client";

import { ToolPreview } from "./ToolPreview";
import { useMemo, useState } from "react";
import type {
  FloorSettings,
  PreChatLink,
  QuickBuildField,
  QuickBuildFieldType,
} from "@/lib/types";
import { IconCheck, IconTrash } from "@/components/shared/Icons";
import {
  defaultQuickBuildConfig,
  formLinksFrom,
  formShare,
  quickBuildConfigForLink,
} from "@/lib/quickBuilds";
import { defaultPreChat } from "@/lib/spaceNormalize";

interface FormsManagerPanelProps {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
}

function newFormLink(): PreChatLink {
  const config = defaultQuickBuildConfig("form");
  if (config.type !== "form") {
    throw new Error("Expected form config");
  }
  return {
    id: `pre-quick-form-${Date.now().toString(36)}`,
    kind: "url",
    label: "Fill out a form",
    enabled: false,
    showInWidget: false,
    quickBuild: config,
  };
}

export function FormsManagerPanel({
  slug,
  settings,
  onChangeSettings,
}: FormsManagerPanelProps) {
  const page = settings.preChat ?? defaultPreChat();
  const forms = useMemo(() => formLinksFrom(settings), [settings]);
  const selectedKey = `otgf-forms-selected:${slug}`;
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (typeof window === "undefined") return forms[0]?.id ?? null;
    try {
      const stored = window.sessionStorage.getItem(selectedKey);
      if (stored && forms.some((item) => item.id === stored)) return stored;
    } catch {
      /* ignore */
    }
    return forms[0]?.id ?? null;
  });
  const [copied, setCopied] = useState<"embed" | "page" | null>(null);
  const [pane, setPane] = useState<"details" | "fields" | "share">("details");

  function selectForm(id: string | null) {
    setSelectedId(id);
    try {
      if (id) window.sessionStorage.setItem(selectedKey, id);
      else window.sessionStorage.removeItem(selectedKey);
    } catch {
      /* ignore */
    }
  }
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  const selected =
    forms.find((item) => item.id === selectedId) ?? forms[0] ?? null;
  const config = selected ? quickBuildConfigForLink(selected) : null;
  const formConfig = config?.type === "form" ? config : null;
  const share = selected ? formShare(selected) : { embed: false, page: false };
  const pageUrl = selected
    ? `${origin}/${slug}/form/${encodeURIComponent(selected.id)}`
    : "";
  const embedSnippet = selected
    ? `<iframe src="${origin}/${slug}/embed?action=${encodeURIComponent(selected.id)}" title="${selected.label}" style="width:100%;min-height:640px;border:0;"></iframe>`
    : "";

  function persistLinks(links: PreChatLink[]) {
    onChangeSettings({
      ...settings,
      preChat: { ...page, links },
    });
  }

  function patchSelected(next: Partial<PreChatLink>, formPatch?: Partial<typeof formConfig>) {
    if (!selected || !formConfig) return;
    persistLinks(
      page.links.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              ...next,
              quickBuild: { ...formConfig, ...formPatch },
            }
          : item,
      ),
    );
  }

  function createForm() {
    if (page.links.length >= 16) return;
    const link = newFormLink();
    persistLinks([...page.links, link]);
    selectForm(link.id);
  }

  function removeForm(id: string) {
    const next = page.links.filter((item) => item.id !== id);
    persistLinks(next);
    const remaining = formLinksFrom({ preChat: { ...page, links: next } });
    selectForm(remaining[0]?.id ?? null);
  }

  async function copy(kind: "embed" | "page", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard can be blocked */
    }
  }

  function addField() {
    if (!formConfig) return;
    patchSelected(
      {},
      {
        fields: [
          ...formConfig.fields,
          {
            id: `field-${Date.now().toString(36)}`,
            label: "New field",
            type: "text",
            required: false,
          },
        ],
      },
    );
  }

  function patchField(id: string, patch: Partial<QuickBuildField>) {
    if (!formConfig) return;
    patchSelected(
      {},
      {
        fields: formConfig.fields.map((field) =>
          field.id === id ? { ...field, ...patch } : field,
        ),
      },
    );
  }

  const FORM_SECTIONS = [
    { id: "details", label: "Form" },
    { id: "fields", label: "Fields" },
    { id: "share", label: "Share" },
  ] as const;

  return (
    <div className="forms-manager-shell schedule-settings">
    <div className="dashboard-panel-body forms-manager">
        <div className="schedule-settings-body">
          <aside className="schedule-settings-rail" aria-label="Your forms">
            <div className="schedule-settings-rail-head">
              <div>
                <strong>Forms</strong>
                <span>{forms.length ? `${forms.length} ${forms.length === 1 ? "form" : "forms"}` : "None yet"}</span>
              </div>
              <button type="button" className="btn-solid" onClick={createForm} disabled={page.links.length >= 16}>New</button>
            </div>
            {forms.length ? (
              <ul className="schedule-settings-events">
                {forms.map((item) => {
                  const shareState = formShare(item);
                  const active = item.id === selected?.id;
                  return (
                    <li key={item.id}>
                      <button type="button" className={active ? "is-active" : undefined} aria-current={active ? "true" : undefined} onClick={() => selectForm(item.id)}>
                        <strong>{item.label || "Untitled form"}</strong>
                        <span className="schedule-settings-event-meta">
                          {shareState.embed ? <em>Embed</em> : null}
                          {shareState.page ? <em>Page</em> : null}
                          {!shareState.embed && !shareState.page ? <em>Private</em> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="schedule-settings-rail-empty">Create a form to get a page link and an embed.</p>
            )}
          </aside>
          {selected && formConfig ? (
            <section className="schedule-settings-editor" aria-label="Edit form">
              <div className="schedule-settings-editor-bar">
                <nav className="schedule-settings-toc" aria-label="Form settings">
                  {FORM_SECTIONS.map((section) => (
                    <button
                      type="button"
                      key={section.id}
                      className={pane === section.id ? "is-active" : undefined}
                      aria-current={pane === section.id ? "page" : undefined}
                      onClick={() => setPane(section.id)}
                    >
                      {section.label}
                    </button>
                  ))}
                </nav>
                <button type="button" className="btn-ghost schedule-settings-delete" onClick={() => {
                  if (!window.confirm(`Delete ${selected.label || "this form"}?`)) return;
                  removeForm(selected.id);
                  setPane("details");
                }}>
                  Delete form
                </button>
              </div>
              <div className="schedule-settings-editor-scroll">
            {pane === "details" ? (
              <section className="settings-editor-card">
              <h3>Form details</h3>
              <label className="floor-settings-note">
                <span>Button label</span>
                <input
                  value={selected.label}
                  onChange={(event) =>
                    patchSelected({ label: event.target.value.slice(0, 80) })
                  }
                  maxLength={80}
                />
              </label>
              <label className="floor-settings-note">
                <span>Form title</span>
                <input
                  value={formConfig.title}
                  onChange={(event) =>
                    patchSelected({}, { title: event.target.value.slice(0, 100) })
                  }
                />
              </label>
              <label className="floor-settings-note">
                <span>Short explanation</span>
                <input
                  value={formConfig.description}
                  onChange={(event) =>
                    patchSelected(
                      {},
                      { description: event.target.value.slice(0, 240) },
                    )
                  }
                />
              </label>

              </section>
            ) : null}
            {pane === "fields" ? (
              <section className="quick-build-form-builder settings-editor-card">
                <div className="quick-build-builder-head">
                  <h3>Fields</h3>
                  <button type="button" className="btn-ghost" onClick={addField}>
                    Add field
                  </button>
                </div>
                {formConfig.fields.map((field) => (
                  <div className="quick-build-field-row" key={field.id}>
                    <input
                      value={field.label}
                      onChange={(event) =>
                        patchField(field.id, { label: event.target.value })
                      }
                      aria-label="Field label"
                    />
                    <select
                      value={field.type}
                      onChange={(event) =>
                        patchField(field.id, {
                          type: event.target.value as QuickBuildFieldType,
                        })
                      }
                      aria-label={`Type for ${field.label}`}
                    >
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                      <option value="email">Email</option>
                      <option value="tel">Phone</option>
                    </select>
                    <label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          patchField(field.id, {
                            required: event.target.checked,
                          })
                        }
                      />{" "}
                      Required
                    </label>
                    <button
                      type="button"
                      className="btn-ghost icon-btn"
                      aria-label={`Remove ${field.label}`}
                      onClick={() =>
                        patchSelected(
                          {},
                          {
                            fields: formConfig.fields.filter(
                              (item) => item.id !== field.id,
                            ),
                          },
                        )
                      }
                    >
                      <IconTrash />
                    </button>
                  </div>
                ))}
              </section>
            ) : null}
            {pane === "share" ? (
              <section className="forms-share schedule-share">
                <div className="settings-editor-card">
                <button
                  type="button"
                  className={`components-toggle-row${share.embed ? " is-on" : ""}`}
                  role="switch"
                  aria-checked={share.embed}
                  onClick={() =>
                    patchSelected({}, { shareEmbed: !share.embed })
                  }
                >
                  <span className="components-toggle-copy">
                    <strong>Embed on a site</strong>
                    <em>Paste an iframe on any webpage.</em>
                  </span>
                  <span
                    className={`components-switch${share.embed ? " is-on" : ""}`}
                    aria-hidden
                  />
                </button>
                {share.embed ? (
                  <div className="forms-share-copy">
                    <pre>
                      <code>{embedSnippet}</code>
                    </pre>
                    <button
                      type="button"
                      className="btn-solid"
                      onClick={() => void copy("embed", embedSnippet)}
                    >
                      {copied === "embed" ? (
                        <>
                          <IconCheck size={14} /> Copied
                        </>
                      ) : (
                        "Copy embed"
                      )}
                    </button>
                  </div>
                ) : null}
                </div>
                <div className="settings-editor-card">
                <button
                  type="button"
                  className={`components-toggle-row${share.page ? " is-on" : ""}`}
                  role="switch"
                  aria-checked={share.page}
                  onClick={() => patchSelected({}, { sharePage: !share.page })}
                >
                  <span className="components-toggle-copy">
                    <strong>Separate page</strong>
                    <em>A public link just for this form.</em>
                  </span>
                  <span
                    className={`components-switch${share.page ? " is-on" : ""}`}
                    aria-hidden
                  />
                </button>
                {share.page ? (
                  <div className="forms-share-copy">
                    <pre>
                      <code>{pageUrl}</code>
                    </pre>
                    <div className="forms-share-actions">
                      <a
                        className="btn-ghost"
                        href={pageUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open page
                      </a>
                      <button
                        type="button"
                        className="btn-solid"
                        onClick={() => void copy("page", pageUrl)}
                      >
                        {copied === "page" ? (
                          <>
                            <IconCheck size={14} /> Copied
                          </>
                        ) : (
                          "Copy link"
                        )}
                      </button>
                    </div>
                  </div>
                ) : null}
                </div>
              </section>
            ) : null}
              </div>
            </section>
          ) : (
            <p className="schedule-settings-editor-empty">Create a form to get a page link and an embed.</p>
          )}
        </div>
    </div>
    {selected ? <ToolPreview slug={slug} link={selected} /> : null}
    </div>
  );
}
