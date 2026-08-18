"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ChatParticipant } from "@/lib/types";
import {
  getForwardInvite,
  joinForwardChat,
  type ForwardInviteMeta,
} from "@/lib/store";
import {
  recallForwardParticipant,
  rememberForwardParticipant,
} from "@/lib/forwardChat";
import { ForwardChat } from "./ForwardChat";

interface ForwardJoinProps {
  slug: string;
  token: string;
}

export function ForwardJoin({ slug, token }: ForwardJoinProps) {
  const [invite, setInvite] = useState<ForwardInviteMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [participant, setParticipant] = useState<ChatParticipant | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await getForwardInvite(slug, token);
        if (cancelled) return;
        if (!next || next.slug !== slug) {
          setError("This forward link expired.");
          return;
        }
        setInvite(next);
        const remembered = recallForwardParticipant(token);
        if (remembered) {
          try {
            const joined = await joinForwardChat(slug, token, {
              name: remembered.name,
              department: remembered.department,
              participantId: remembered.id,
            });
            if (cancelled) return;
            rememberForwardParticipant(token, joined.participant);
            setParticipant(joined.participant);
          } catch {
            // Show the name form if auto-join fails.
          }
        }
      } catch {
        if (!cancelled) setError("This forward link expired.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const joined = await joinForwardChat(slug, token, {
        name: trimmed,
        department: department.trim() || undefined,
      });
      rememberForwardParticipant(token, joined.participant);
      setParticipant(joined.participant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !invite) {
    return (
      <div className="client-missing">
        <p className="brand-name">OTGF</p>
        <h1>Link expired</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (participant && invite) {
    return (
      <ForwardChat
        slug={invite.slug}
        chatId={invite.chatId}
        participant={participant}
      />
    );
  }

  if (!invite) {
    return <div className="client-chat-loading">Opening chat…</div>;
  }

  return (
    <div className="forward-join">
      <div className="forward-join-card">
        <p className="brand-name">OTGF</p>
        <h1>Join this chat</h1>
        <p>
          {invite.businessName} wants you in the conversation with{" "}
          <strong>{invite.customerName}</strong>.
        </p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label>
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              required
              maxLength={48}
              autoFocus
            />
          </label>
          <label>
            <span>Department (optional)</span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Color, kitchen, manager…"
              maxLength={48}
            />
          </label>
          {error ? <p className="forward-join-error">{error}</p> : null}
          <button type="submit" disabled={busy || !name.trim()}>
            {busy ? "Joining…" : "Join chat"}
          </button>
        </form>
      </div>
    </div>
  );
}
