import type { Client, Message } from "./types";

export type SpaceLiveEvent =
  | {
      type: "meta";
      updatedAt: string;
      presence: Record<string, string>;
    }
  | {
      type: "message";
      message: Message;
      client?: Client;
      updatedAt?: string;
    }
  | {
      type: "reactions";
      messageId: string;
      reactions: Message["reactions"];
      updatedAt?: string;
    };

type Listener = (event: SpaceLiveEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function onSpaceEvent(slug: string, listener: Listener): () => void {
  const key = slug.trim().toLowerCase();
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(key);
  };
}

export function emitSpaceEvent(slug: string, event: SpaceLiveEvent) {
  const set = listeners.get(slug.trim().toLowerCase());
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      // ignore a bad subscriber
    }
  }
}
