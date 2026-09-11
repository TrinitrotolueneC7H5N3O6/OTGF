"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { IconCheck, IconX } from "@/components/shared/Icons";
import type { Client, Message, PreChatLink } from "@/lib/types";
import {
  appendMessage,
  applySpaceOp,
  getSpace,
  nextGuestName,
  resolveCustomerChatId,
} from "@/lib/store";
import { buildFormSubmission, messageTimeStamp } from "@/lib/spaceNormalize";
import { useBookingAvailability } from "./useBookingAvailability";
import { BookingCalendar } from "./BookingCalendar";
import { scheduleChoiceOptions, scheduleChoicePrompt, scheduleDates, scheduleSlots } from "@/lib/scheduling";
import { quickBuildConfigForLink } from "@/lib/quickBuilds";
import {
  forgetQuickBuildDraft,
  recallQuickBuildDraft,
  rememberQuickBuildDraft,
} from "@/lib/quickBuildDrafts";

interface QuickBuildModalProps {
  link: PreChatLink;
  slug: string;
  onClose: () => void;
  embedded?: boolean;
  preview?: boolean;
}

export function QuickBuildModal({
  link,
  slug,
  onClose,
  embedded = false,
  preview = false,
}: QuickBuildModalProps) {
  const config = useMemo(() => quickBuildConfigForLink(link), [link]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(false);
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null);
  const draftIdentity = JSON.stringify([slug, link.id]);
  const availability = useBookingAvailability(slug, link.id, !preview && config?.type === "scheduler");
  const bookingToken = useRef("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; status: string; date: string; time: string; timeZone: string; token: string } | null>(null);
  const slots = config?.type === "scheduler" ? (preview ? scheduleSlots(config, values.date ?? "") : availability.slots[values.date ?? ""] ?? []) : [];

  useEffect(() => {
    if (preview) return;
    const frame = window.requestAnimationFrame(() => {
      const draft = recallQuickBuildDraft(slug, link.id);
      if (config?.type === "scheduler" && draft.date && !scheduleDates(config).some((day) => day.value === draft.date)) {
        delete draft.date;
        delete draft.time;
      }
      setValues(draft);
      setDraftReadyFor(draftIdentity);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [config, draftIdentity, link.id, slug, preview]);

  useEffect(() => {
    if (preview || draftReadyFor !== draftIdentity || sent) return;
    rememberQuickBuildDraft(slug, link.id, values);
  }, [draftIdentity, draftReadyFor, link.id, sent, slug, values, preview]);

  useEffect(() => {
    if (preview || !embedded || !sent || config?.type === "scheduler") return;
    const timer = window.setTimeout(() => onClose(), 1600);
    return () => window.clearTimeout(timer);
  }, [embedded, sent, onClose, preview, config?.type]);

  if (!config) return null;

  function patch(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value, ...(key === "date" ? { time: "" } : {}) }));
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!config || sending) return;
    if (config.type === "scheduler" && !bookingDetails) return;
    if (preview) {
      setSent(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (config.type === "scheduler") {
        const name = values.name?.trim();
        if (!name || !values.date || !values.time) {
          throw new Error("Choose a name, date, and time.");
        }
        if (!scheduleSlots(config, values.date).some((slot) => slot.value === values.time)) {
          throw new Error("That time is no longer available. Choose another time.");
        }
        if (config.requirePhone && !values.phone?.trim()) throw new Error("Enter a phone number.");
        const options = scheduleChoiceOptions(config);
        if (options.length && !options.includes(values.choice?.trim() ?? "")) throw new Error("Choose an option.");
        if (!bookingToken.current) bookingToken.current = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
        const response = await fetch(`/api/spaces/${encodeURIComponent(slug)}/bookings`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", schedulerId: link.id, token: bookingToken.current, name, email: values.email?.trim(), phone: values.phone?.trim(), date: values.date, time: values.time, notes: values.question?.trim(), choice: values.choice?.trim() }),
        });
        const result = await response.json();
        if (!response.ok) { availability.refresh(); setBookingDetails(false); throw new Error(result.error || "Could not book this appointment."); }
        setReceipt({ ...result.booking, token: result.token });
        forgetQuickBuildDraft(slug, link.id);
        setSent(true);
        return;
      }

      if (config.type === "form") {
        const fields = config.fields.map((field) => ({
          label: field.label,
          value: values[field.id]?.trim() || "",
        }));
        const name =
          fields.find((field) => /name/i.test(field.label))?.value.trim() ||
          "Guest";
        const email = fields.find((field) => /email/i.test(field.label))?.value.trim();
        const phone = fields.find((field) =>
          /phone|mobile|tel/i.test(field.label),
        )?.value.trim();
        await applySpaceOp(slug, {
          type: "createFormSubmission",
          formSubmission: buildFormSubmission({
            name,
            email: email || undefined,
            phone: phone || undefined,
            title: config.title,
            fields,
          }),
        });
        forgetQuickBuildDraft(slug, link.id);
        setSent(true);
        return;
      }

      const resolved = await resolveCustomerChatId(slug);
      const space = await getSpace(resolved.spaceSlug);
      if (!space) throw new Error("This business is not available.");
      const existing = space.clients.find((client) => client.id === resolved.chatId);
      const name = values.name?.trim() || existing?.name || nextGuestName(space.clients);
      const entries = [
        ["Name", name],
        [config.type === "sms" ? "Phone" : "Email", config.type === "sms" ? values.phone : values.email],
        ["Question", values.question],
      ];
      const body = `${config.title}:\n${entries.map(([key, value]) => `${key}: ${value}`).join("\n")}`;
      const presentAt = new Date().toISOString();
      const client: Client = existing
        ? {
            ...existing,
            name,
            ...(values.email?.trim() ? { email: values.email.trim() } : {}),
            preview: body,
            unread: existing.unread + 1,
            lastActive: "Just now",
            presentAt,
          }
        : {
            id: resolved.chatId,
            name,
            ...(values.email?.trim() ? { email: values.email.trim() } : {}),
            status: "unknown",
            channel: "web",
            preview: body,
            unread: 1,
            trade: space.business.trade,
            lastActive: "Just now",
            note: `Submitted ${link.label}`,
            presentAt,
          };
      const message: Message = {
        id: `m-quick-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        clientId: resolved.chatId,
        from: "client",
        kind: "text",
        body,
        ...messageTimeStamp(),
      };
      await appendMessage(resolved.spaceSlug, { message, client });
      forgetQuickBuildDraft(slug, link.id);
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send. Try again.");
    } finally {
      setSending(false);
    }
  }

  function closeModal() {
    if (!preview && !sent && draftReadyFor === draftIdentity) {
      rememberQuickBuildDraft(slug, link.id, values);
    }
    onClose();
  }

  return (
    <div className="pre-chat-contact-backdrop" onClick={embedded ? undefined : closeModal}>
      <section className={`pre-chat-contact-modal quick-build-customer-modal quick-build-customer-modal-${config.type}`} role="dialog" aria-modal="true" aria-labelledby="quick-build-modal-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>{config.type === "scheduler" ? "SCHEDULE" : "CONTACT"}</span>
            <h2 id="quick-build-modal-title">{config.title}</h2>
          </div>
          {embedded ? null : <button type="button" className="btn-ghost icon-btn" aria-label="Close" onClick={closeModal}><IconX /></button>}
        </header>
        {sent ? (
          <div className="quick-build-customer-success" role="status">
            <span><IconCheck size={18} /></span>
            <h3>{preview ? "Preview complete" : config.type === "scheduler" ? (receipt?.status === "confirmed" ? "Appointment confirmed" : "Request received") : config.type === "form" ? "Form received" : "Message sent"}</h3>
            <p>{preview ? "This was a preview. Nothing was submitted." : config.type === "scheduler" ? (receipt?.status === "confirmed" ? "Your time is reserved. Save your private link below to manage your appointment." : "Your time is reserved while the team reviews your request. Save your private link below.") : config.type === "form" ? "The team will follow up using the details you shared." : "The team will follow up using the contact method you provided."}</p>
            {receipt && <><p>{receipt.date} · {receipt.time} · {receipt.timeZone}</p><a className="btn-solid" href={`/${slug}/booking/${receipt.id}#${receipt.token}`} target="_blank" rel="noreferrer">Manage appointment</a><button type="button" className="btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/${slug}/booking/${receipt.id}#${receipt.token}`); setLinkCopied(true); } catch { setLinkCopied(false); } }}>{linkCopied ? "Link copied" : "Copy private link"}</button><p className="floor-settings-help">Keep this private link to cancel or reschedule later.</p></>}
            {embedded ? null : <button type="button" className="btn-solid" onClick={closeModal}>Done</button>}
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="quick-build-customer-fields">
              <p className="quick-build-customer-description">{config.description}</p>
              {config.type === "form" ? config.fields.map((field) => (
                <label className="floor-settings-note" key={field.id}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  {field.type === "textarea" ? (
                    <textarea rows={4} required={field.required} value={values[field.id] ?? ""} onChange={(event) => patch(field.id, event.target.value)} />
                  ) : (
                    <input type={field.type} required={field.required} value={values[field.id] ?? ""} onChange={(event) => patch(field.id, event.target.value)} />
                  )}
                </label>
              )) : config.type === "scheduler" ? (
                <>
                  <p className="floor-settings-help">{config.type === "scheduler" ? `${config.durationMinutes} minutes · ${config.timeZone ?? "UTC"}${config.location ? ` · ${config.location}` : ""}` : ""}</p>
                  {!bookingDetails ? (
                    <BookingCalendar slotsByDate={preview ? undefined : availability.slots} config={config} date={values.date ?? ""} time={values.time ?? ""} onDate={(date) => patch("date", date)} onTime={(time) => patch("time", time)} />
                  ) : (
                    <>
                      <div className="booking-selection">
                        <div><strong>{values.date ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${values.date}T12:00:00Z`)) : "Choose a date"} · {slots.find((slot) => slot.value === values.time)?.label ?? values.time}</strong><span>{config.durationMinutes} minutes · {config.timeZone ?? "UTC"}</span></div>
                        <button type="button" className="btn-ghost" onClick={() => setBookingDetails(false)}>Change time</button>
                      </div>
                      <h3 className="booking-details-title">Your details</h3>
                      {scheduleChoiceOptions(config).length ? (
                        config.choiceDisplay === "list" ? (
                          <fieldset className="booking-choice-list">
                            <legend>{scheduleChoicePrompt(config)} *</legend>
                            {scheduleChoiceOptions(config).map((option) => (
                              <label key={option}>
                                <input type="radio" name="booking-choice" required checked={values.choice === option} onChange={() => patch("choice", option)} />
                                {option}
                              </label>
                            ))}
                          </fieldset>
                        ) : (
                          <label className="floor-settings-note">
                            <span>{scheduleChoicePrompt(config)} *</span>
                            <select required value={values.choice ?? ""} onChange={(event) => patch("choice", event.target.value)}>
                              <option value="">Select</option>
                              {scheduleChoiceOptions(config).map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </label>
                        )
                      ) : null}
                      <label className="floor-settings-note"><span>Name *</span><input required autoComplete="name" value={values.name ?? ""} onChange={(event) => patch("name", event.target.value)} /></label>
                      <div className="quick-build-customer-grid">
                        <label className="floor-settings-note"><span>Email *</span><input required type="email" autoComplete="email" value={values.email ?? ""} onChange={(event) => patch("email", event.target.value)} /></label>
                        <label className="floor-settings-note"><span>Phone{config.requirePhone ? " *" : ""}</span><input required={config.requirePhone} type="tel" autoComplete="tel" value={values.phone ?? ""} onChange={(event) => patch("phone", event.target.value)} /></label>
                      </div>
                      <label className="floor-settings-note"><span>Anything we should know?</span><textarea rows={embedded ? 2 : 3} value={values.question ?? ""} onChange={(event) => patch("question", event.target.value)} /></label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <label className="floor-settings-note"><span>Name *</span><input required autoComplete="name" value={values.name ?? ""} onChange={(event) => patch("name", event.target.value)} /></label>
                  <label className="floor-settings-note"><span>{config.type === "sms" ? "Mobile number" : "Email address"} *</span><input required type={config.type === "sms" ? "tel" : "email"} autoComplete={config.type === "sms" ? "tel" : "email"} value={config.type === "sms" ? values.phone ?? "" : values.email ?? ""} onChange={(event) => patch(config.type === "sms" ? "phone" : "email", event.target.value)} /></label>
                  <label className="floor-settings-note"><span>Your question *</span><textarea required rows={5} value={values.question ?? ""} onChange={(event) => patch("question", event.target.value)} /></label>
                </>
              )}
              {config.type === "scheduler" && availability.loading ? <p role="status">Checking availability…</p> : null}
              {config.type === "scheduler" && availability.error ? <p role="alert">{availability.error} <button type="button" className="btn-ghost" onClick={availability.refresh}>Retry</button></p> : null}
              {error ? <p className="editor-error" role="alert">{error}</p> : null}
            </div>
            {config.type === "scheduler" && !bookingDetails ? (
              <button key="booking-continue" type="button" className="btn-solid quick-build-customer-submit" disabled={!values.date || !slots.some((slot) => slot.value === values.time)} onClick={(event) => { event.preventDefault(); setBookingDetails(true); }}>Continue</button>
            ) : (
              <button key="booking-submit" type="submit" className="btn-solid quick-build-customer-submit" disabled={sending}>{sending ? "Sending…" : config.type === "scheduler" ? (config.confirmationMode === "instant" ? "Confirm appointment" : "Request appointment") : "Send question"}</button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
