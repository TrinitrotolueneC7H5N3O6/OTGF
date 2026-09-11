"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  FloorSettings,
  PreChatLink,
  PreChatLinkKind,
  PreChatPage,
  QuickBuildConfig,
  QuickBuildField,
  QuickBuildFieldType,
} from "@/lib/types";
import { defaultPreChat } from "@/lib/spaceNormalize";
import { IconCheck, IconTrash } from "@/components/shared/Icons";
import { defaultQuickBuildConfig } from "@/lib/quickBuilds";
import { isWorkspaceComponentEnabled } from "@/lib/workspaceComponents";
import { dashHref } from "@/lib/workspaceNav";
import {
  isPublicActionEnabled,
  isPublicPageEnabled,
  isPublicWidgetEnabled,
} from "@/lib/toolPublic";

type ActionType = "chat" | "form" | "scheduler" | "sms" | "call" | "email";

interface ActionTemplate {
  id: ActionType;
  eyebrow: string;
  title: string;
  description: string;
  defaultLabel?: string;
  fieldLabel?: string;
  placeholder?: string;
  inputType?: "url" | "tel" | "email";
  linkKind?: PreChatLinkKind;
}

const ACTIONS: ActionTemplate[] = [
  {
    id: "chat",
    eyebrow: "CHAT",
    title: "Live chat",
    description: "Goes to your Live Chat inbox.",
  },
  {
    id: "form",
    eyebrow: "FORM",
    title: "Fill out a form",
    description: "Submissions land in Forms.",
    defaultLabel: "Fill out a form",
    fieldLabel: "Form URL",
    placeholder: "https://forms.example.com/intake",
    inputType: "url",
    linkKind: "url",
  },
  {
    id: "scheduler",
    eyebrow: "DATE",
    title: "Schedule a time",
    description: "Requests land in Schedule.",
    defaultLabel: "Schedule a time",
    fieldLabel: "Scheduling URL",
    placeholder: "https://cal.example.com/your-business",
    inputType: "url",
    linkKind: "url",
  },
  {
    id: "sms",
    eyebrow: "SMS",
    title: "Text us",
    description: "Open a text to your business number.",
    defaultLabel: "Text us",
    fieldLabel: "Text message number",
    placeholder: "+1 877 780 4236",
    inputType: "tel",
    linkKind: "sms",
  },
  {
    id: "call",
    eyebrow: "CALL",
    title: "Call us",
    description: "One tap to call your team.",
    defaultLabel: "Call us",
    fieldLabel: "Phone number",
    placeholder: "+1 877 780 4236",
    inputType: "tel",
    linkKind: "call",
  },
  {
    id: "email",
    eyebrow: "MAIL",
    title: "Email us",
    description: "Open a new email to your inbox.",
    defaultLabel: "Email us",
    fieldLabel: "Email address",
    placeholder: "hello@yourbusiness.com",
    inputType: "email",
    linkKind: "email",
  },
];

interface QuickBuildsPanelProps {
  slug: string;
  settings: FloorSettings;
  onChangeSettings: (settings: FloorSettings) => void;
  hideTitle?: boolean;
}

function normalizeUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function visibleActions(settings: FloorSettings) {
  const buildsOn = isWorkspaceComponentEnabled(settings, "quickBuilds");
  return ACTIONS.filter((item) => {
    if (!isPublicActionEnabled(settings, item.id)) return false;
    if (item.id === "chat" || item.id === "scheduler" || item.id === "form") {
      return true;
    }
    return buildsOn;
  });
}

function chatLinkFrom(page: PreChatPage) {
  return page.links.find((link) => link.kind === "chat" || link.id === "pre-live-chat");
}

function actionTypeFromLink(link: PreChatLink): ActionType | null {
  if (link.kind === "chat" || link.id === "pre-live-chat") return "chat";
  const match = /^pre-quick-(form|scheduler|sms|call|email)-/.exec(link.id);
  return (match?.[1] as ActionType | undefined) ?? null;
}

function validateDestination(template: ActionTemplate, raw: string) {
  if (template.id === "form" || template.id === "scheduler" || template.id === "chat") {
    return { value: "" };
  }
  const value = raw.trim();
  if (!value) {
    return { error: `Add a ${(template.fieldLabel ?? "destination").toLowerCase()}.` };
  }
  if (template.inputType === "url") {
    const url = normalizeUrl(value);
    return url ? { value: url } : { error: "Enter a complete web address." };
  }
  if (template.inputType === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? { value }
      : { error: "Enter a valid email address." };
  }
  return value.replace(/\D/g, "").length >= 7
    ? { value }
    : { error: "Enter a valid phone number." };
}

function PlacementChips({
  pageOn,
  widgetOn,
  pageAllowed,
  widgetAllowed,
  onTogglePage,
  onToggleWidget,
}: {
  pageOn: boolean;
  widgetOn: boolean;
  pageAllowed: boolean;
  widgetAllowed: boolean;
  onTogglePage: () => void;
  onToggleWidget: () => void;
}) {
  if (!pageAllowed && !widgetAllowed) {
    return (
      <p className="floor-settings-help">
        Turn on Micro-landing page or Widget under Workspace setup → Platforms first.
      </p>
    );
  }
  return (
    <div className="action-placements">
      {pageAllowed ? (
        <button
          type="button"
          className={`action-place-chip${pageOn ? " is-on" : ""}`}
          aria-pressed={pageOn}
          onClick={onTogglePage}
        >
          On your micro-landing page
        </button>
      ) : null}
      {widgetAllowed ? (
        <button
          type="button"
          className={`action-place-chip${widgetOn ? " is-on" : ""}`}
          aria-pressed={widgetOn}
          onClick={onToggleWidget}
        >
          In the widget
        </button>
      ) : null}
    </div>
  );
}

export function QuickBuildsPanel({
  slug,
  settings,
  onChangeSettings,
  hideTitle = false,
}: QuickBuildsPanelProps) {
  const page = settings.preChat ?? defaultPreChat();
  const templates = useMemo(() => visibleActions(settings), [settings]);
  const [selected, setSelected] = useState<ActionType>(
    templates[0]?.id ?? "form",
  );

  useEffect(() => {
    if (templates.some((item) => item.id === selected)) return;
    setSelected(templates[0]?.id ?? "form");
  }, [templates, selected]);
  const template = templates.find((item) => item.id === selected) ?? ACTIONS[0];
  const [label, setLabel] = useState(template.defaultLabel ?? "");
  const [destination, setDestination] = useState("");
  const [showOnPage, setShowOnPage] = useState(true);
  const [showInWidget, setShowInWidget] = useState(true);
  const initialForm = defaultQuickBuildConfig("form") as Extract<QuickBuildConfig, { type: "form" }>;
  const initialSchedule = defaultQuickBuildConfig("scheduler") as Extract<QuickBuildConfig, { type: "scheduler" }>;
  const [modalTitle, setModalTitle] = useState(initialForm.title);
  const [modalDescription, setModalDescription] = useState(initialForm.description);
  const [formFields, setFormFields] = useState<QuickBuildField[]>(initialForm.fields);
  const [durationMinutes, setDurationMinutes] = useState(initialSchedule.durationMinutes);
  const [startTime, setStartTime] = useState(initialSchedule.startTime);
  const [endTime, setEndTime] = useState(initialSchedule.endTime);
  const [daysAhead, setDaysAhead] = useState(initialSchedule.daysAhead);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const configured = useMemo(
    () =>
      page.links.filter((link) => {
        const type = actionTypeFromLink(link);
        return (
          type &&
          type !== "chat" &&
          isPublicActionEnabled(settings, type)
        );
      }),
    [page.links, settings],
  );
  const chatLink = chatLinkFrom(page);
  const chatOnPage = Boolean(chatLink?.enabled);
  const chatInWidget = Boolean(chatLink?.showInWidget);
  const pageAllowed = isPublicPageEnabled(settings);
  const widgetAllowed = isPublicWidgetEnabled(settings);

  function persist(next: FloorSettings) {
    onChangeSettings(next);
  }

  function persistLinks(links: PreChatLink[]) {
    persist({
      ...settings,
      preChat: { ...(settings.preChat ?? page), links },
    });
  }

  function choose(next: ActionTemplate) {
    setSelected(next.id);
    setError(null);
    setSaved(null);
    if (next.id === "chat") return;
    const config = defaultQuickBuildConfig(
      next.id === "call" ? "form" : next.id,
    );
    setLabel(next.defaultLabel ?? "");
    setDestination("");
    setShowOnPage(pageAllowed);
    setShowInWidget(widgetAllowed);
    if (next.id !== "call") {
      setModalTitle(config.title);
      setModalDescription(config.description);
    }
  }

  function toggleChatPage() {
    if (!isPublicActionEnabled(settings, "chat")) return;
    if (!isPublicPageEnabled(settings)) return;
    const turningOn = !chatOnPage;
    let links = page.links;
    if (!chatLink) {
      links = [
        ...links,
        {
          id: "pre-live-chat",
          kind: "chat",
          label: "Live Chat",
          enabled: turningOn,
          showInWidget: chatInWidget,
        },
      ];
    } else {
      links = links.map((item) =>
        item.id === chatLink.id ? { ...item, enabled: turningOn } : item,
      );
    }
    persistLinks(links);
  }

  function toggleChatWidget() {
    if (!isPublicActionEnabled(settings, "chat")) return;
    if (!isPublicWidgetEnabled(settings)) return;
    const turningOn = !chatInWidget;
    let links = page.links;
    if (!chatLink) {
      links = [
        ...links,
        {
          id: "pre-live-chat",
          kind: "chat",
          label: "Live Chat",
          enabled: chatOnPage,
          showInWidget: turningOn,
        },
      ];
    } else {
      links = links.map((item) =>
        item.id === chatLink.id ? { ...item, showInWidget: turningOn } : item,
      );
    }
    persistLinks(links);
  }

  function toggleLinkPage(link: PreChatLink) {
    const type = actionTypeFromLink(link);
    if (type && !isPublicActionEnabled(settings, type)) return;
    if (!isPublicPageEnabled(settings)) return;
    persistLinks(
      page.links.map((item) =>
        item.id === link.id ? { ...item, enabled: !link.enabled } : item,
      ),
    );
  }

  function toggleLinkWidget(link: PreChatLink) {
    const type = actionTypeFromLink(link);
    if (type && !isPublicActionEnabled(settings, type)) return;
    if (!isPublicWidgetEnabled(settings)) return;
    persistLinks(
      page.links.map((item) =>
        item.id === link.id ? { ...item, showInWidget: !link.showInWidget } : item,
      ),
    );
  }

  function patchFormField(id: string, patch: Partial<QuickBuildField>) {
    setFormFields((fields) =>
      fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function addFormField() {
    setFormFields((fields) => [
      ...fields,
      {
        id: `field-${Date.now().toString(36)}`,
        label: "New question",
        type: "text",
        required: false,
      },
    ]);
  }

  function buildConfig(): QuickBuildConfig | undefined {
    if (selected === "call" || selected === "chat") return undefined;
    if (selected === "form") {
      return {
        type: "form",
        title: modalTitle.trim() || initialForm.title,
        description: modalDescription.trim() || initialForm.description,
        fields: formFields,
      };
    }
    if (selected === "scheduler") {
      return {
        ...initialSchedule,
        type: "scheduler",
        title: modalTitle.trim() || initialSchedule.title,
        description: modalDescription.trim() || initialSchedule.description,
        durationMinutes,
        startTime,
        endTime,
        daysAhead,
      };
    }
    return {
      type: selected,
      title: modalTitle.trim() || "Ask a question",
      description:
        selected === "sms"
          ? "Ask a question and we will respond via text."
          : "Ask a question and we will respond via email.",
    };
  }

  function addBuild() {
    if (selected === "chat" || !template.linkKind) return;
    if (!isPublicActionEnabled(settings, selected)) return;
    const onPage = showOnPage && pageAllowed;
    const inWidget = showInWidget && widgetAllowed;
    if (!onPage && !inWidget) {
      setError("Turn on Micro-landing page or Widget under Workspace setup → Platforms first.");
      return;
    }
    const nextLabel = label.trim();
    if (!nextLabel) {
      setError("Give the action a button label.");
      return;
    }
    const result = validateDestination(template, destination);
    if (!("value" in result)) {
      setError(result.error);
      return;
    }
    const link: PreChatLink = {
      id: `pre-quick-${template.id}-${Date.now().toString(36)}`,
      kind: template.linkKind,
      label: nextLabel,
      enabled: onPage,
      showInWidget: inWidget,
      quickBuild: buildConfig(),
      href: result.value || undefined,
    };
    persistLinks([...page.links, link]);
    setDestination("");
    setError(null);
    const where = [
      onPage ? "your micro-landing page" : null,
      inWidget ? "the widget" : null,
    ].filter(Boolean);
    setSaved(`${nextLabel} will show on ${where.join(" and ")}.`);
  }

  function removeBuild(id: string) {
    persistLinks(page.links.filter((link) => link.id !== id));
    setSaved(null);
  }

  return (
    <div className="forms-manager-shell schedule-settings">
    <div className="dashboard-panel-body forms-manager">
      <div className="schedule-settings-body">
        <aside className="schedule-settings-rail" aria-label="Public actions">
          <div className="schedule-settings-rail-head">
            <div>
              <strong>Actions</strong>
              <span>{templates.length ? `${templates.length} available` : "None yet"}</span>
            </div>
          </div>
          {templates.length === 0 ? (
            <p className="schedule-settings-rail-empty">
              Turn on a tool in Tools to offer it on your micro-landing page or widget.
            </p>
          ) : (
            <ul className="schedule-settings-events">
              {templates.map((item) => {
                const active = selected === item.id;
                return (
                  <li key={item.id}>
                    <button type="button" className={active ? "is-active" : undefined} aria-current={active ? "true" : undefined} onClick={() => choose(item)}>
                      <strong>{item.title}</strong>
                      <span className="schedule-settings-event-meta">
                        <em>{item.eyebrow}</em>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
        <section className="schedule-settings-editor">
          {templates.length > 0 ? (
          <div className="schedule-settings-editor-scroll">
        <div className="quick-build-editor-head">
          <div>
            <span>{selected === "chat" ? "WHERE IT SHOWS" : "BUILDING"}</span>
            <h3 id="quick-build-editor-title">{template.title}</h3>
          </div>
          {selected === "chat" ? null : (
            <span className="quick-build-step">
              {selected === "form" ? `${formFields.length} fields` : selected === "scheduler" ? `${durationMinutes} min` : "2 details"}
            </span>
          )}
        </div>

        {selected === "chat" ? (
          <div className="quick-build-chat-copy">
            <PlacementChips
              pageOn={chatOnPage}
              widgetOn={chatInWidget}
              pageAllowed={pageAllowed}
              widgetAllowed={widgetAllowed}
              onTogglePage={toggleChatPage}
              onToggleWidget={toggleChatWidget}
            />
            <p className="quick-build-standard-copy">
              Live chat is the conversation. A button on your micro-landing page and a bubble
              on your site both go to the same Live Chat inbox.
            </p>
            {pageAllowed || widgetAllowed ? (
            <div className="quick-build-destinations">
              {pageAllowed ? (
              <Link href={dashHref(slug, "client:page")} className="btn-ghost" scroll={false}>
                Micro-landing page look
              </Link>
              ) : null}
              {widgetAllowed ? (
              <Link href={dashHref(slug, "client:chat")} className="btn-ghost" scroll={false}>
                Widget look
              </Link>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="quick-build-fields">
              <label className="floor-settings-note">
                <span>Button label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value.slice(0, 80))}
                  maxLength={80}
                />
              </label>
              {selected !== "form" && selected !== "scheduler" ? (
                <label className="floor-settings-note">
                  <span>{template.fieldLabel ?? "Destination"}</span>
                  <input
                    type={template.inputType ?? "text"}
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder={template.placeholder}
                    autoComplete={template.inputType === "tel" ? "tel" : template.inputType === "email" ? "email" : "url"}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addBuild();
                    }}
                  />
                </label>
              ) : null}
            </div>
            {selected === "form" || selected === "scheduler" ? (
              <div className="quick-build-modal-copy">
                <label className="floor-settings-note">
                  <span>Form title</span>
                  <input value={modalTitle} onChange={(event) => setModalTitle(event.target.value)} />
                </label>
                <label className="floor-settings-note">
                  <span>Short explanation</span>
                  <input value={modalDescription} onChange={(event) => setModalDescription(event.target.value)} />
                </label>
              </div>
            ) : (
              <p className="quick-build-standard-copy">
                {selected === "sms"
                  ? "Ask a question and we will respond via text."
                  : selected === "email"
                    ? "Ask a question and we will respond via email."
                    : "Visitors call this number directly."}
              </p>
            )}
            {selected === "form" ? (
              <div className="quick-build-form-builder">
                <div className="quick-build-builder-head">
                  <h4>Form fields</h4>
                  <button type="button" className="btn-ghost" onClick={addFormField}>Add field</button>
                </div>
                {formFields.map((field) => (
                  <div className="quick-build-field-row" key={field.id}>
                    <input
                      value={field.label}
                      onChange={(event) => patchFormField(field.id, { label: event.target.value })}
                      aria-label="Field label"
                    />
                    <select
                      value={field.type}
                      onChange={(event) => patchFormField(field.id, { type: event.target.value as QuickBuildFieldType })}
                      aria-label={`Type for ${field.label}`}
                    >
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                      <option value="email">Email</option>
                      <option value="tel">Phone</option>
                    </select>
                    <label><input type="checkbox" checked={field.required} onChange={(event) => patchFormField(field.id, { required: event.target.checked })} /> Required</label>
                    <button type="button" className="btn-ghost icon-btn" aria-label={`Remove ${field.label}`} onClick={() => setFormFields((fields) => fields.filter((item) => item.id !== field.id))}><IconTrash /></button>
                  </div>
                ))}
              </div>
            ) : null}
            {selected === "scheduler" ? (
              <div className="quick-build-scheduler-builder">
                <label className="floor-settings-note"><span>Appointment length</span><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>{[15, 30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label>
                <label className="floor-settings-note"><span>First time</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
                <label className="floor-settings-note"><span>Last time</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
                <label className="floor-settings-note"><span>Book up to</span><select value={daysAhead} onChange={(event) => setDaysAhead(Number(event.target.value))}><option value={14}>2 weeks ahead</option><option value={30}>30 days ahead</option><option value={60}>60 days ahead</option><option value={90}>90 days ahead</option></select></label>
              </div>
            ) : null}
            <div className="quick-build-editor-actions">
              <PlacementChips
                pageOn={showOnPage && pageAllowed}
                widgetOn={showInWidget && widgetAllowed}
                pageAllowed={pageAllowed}
                widgetAllowed={widgetAllowed}
                onTogglePage={() => setShowOnPage((value) => !value)}
                onToggleWidget={() => setShowInWidget((value) => !value)}
              />
              <button type="button" className="btn-solid" onClick={addBuild}>
                Save action
              </button>
              {error ? <p className="editor-error" role="alert">{error}</p> : null}
              {saved ? (
                <p className="quick-build-saved" role="status">
                  <IconCheck size={14} /> {saved}
                </p>
              ) : null}
            </div>
          </>
        )}
      {configured.length > 0 ? (
        <section className="quick-build-configured" aria-labelledby="quick-build-configured-title">
          <div className="quick-build-configured-head">
            <h3 id="quick-build-configured-title">Your actions</h3>
            <span>{configured.length}</span>
          </div>
          <ul>
            {configured.map((link) => {
              const type = actionTypeFromLink(link);
              const source = ACTIONS.find((item) => item.id === type);
              return (
                <li key={link.id}>
                  <span className="quick-build-icon is-small" aria-hidden>
                    {source?.eyebrow ?? "LINK"}
                  </span>
                  <span className="quick-build-configured-copy">
                    <strong>{link.label}</strong>
                    <span>{source?.title ?? "Link"}</span>
                  </span>
                  <PlacementChips
                    pageOn={link.enabled}
                    widgetOn={Boolean(link.showInWidget)}
                    pageAllowed={pageAllowed}
                    widgetAllowed={widgetAllowed}
                    onTogglePage={() => toggleLinkPage(link)}
                    onToggleWidget={() => toggleLinkWidget(link)}
                  />
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    aria-label={`Remove ${link.label}`}
                    onClick={() => removeBuild(link.id)}
                  >
                    <IconTrash />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
          </div>
          ) : null}
        </section>
      </div>
    </div>
    </div>
  );
}
