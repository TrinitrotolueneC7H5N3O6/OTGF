"use client";

import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";

const MIN_PX = 38;
const MAX_PX = 168;

function resize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const next = Math.min(Math.max(el.scrollHeight, MIN_PX), MAX_PX);
  // Keep truly single-line text on one row (avoid 2-line box from rounding/padding).
  const single = MIN_PX + 8;
  el.style.height = `${next <= single ? MIN_PX : next}px`;
}

type ComposerTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Enter sends; Shift+Enter inserts a newline. Default true. */
  submitOnEnter?: boolean;
  onSubmit?: () => void;
};

export function ComposerTextarea({
  value,
  onChange,
  submitOnEnter = true,
  onSubmit,
  onKeyDown,
  ...rest
}: ComposerTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [value]);

  function handleChange(e: FormEvent<HTMLTextAreaElement>) {
    onChange(e.currentTarget.value);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  }

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={1}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}
