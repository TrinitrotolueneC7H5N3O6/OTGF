"use client";

import { linkifyText } from "@/lib/messageLinks";

export function MessageBodyText({ text }: { text: string }) {
  if (!text) return null;
  return <p className="bubble-text">{linkifyText(text)}</p>;
}
