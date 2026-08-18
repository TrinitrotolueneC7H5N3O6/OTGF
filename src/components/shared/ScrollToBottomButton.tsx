"use client";

import { useEffect, useState, type RefObject } from "react";
import { IconChevronDown } from "@/components/shared/Icons";

const THRESHOLD = 80;

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
}

interface ScrollToBottomButtonProps {
  containerRef: RefObject<HTMLElement | null>;
}

export function ScrollToBottomButton({
  containerRef,
}: ScrollToBottomButtonProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let frame = 0;
    function update() {
      frame = 0;
      const node = containerRef.current;
      if (!node) return;
      setShow(!isNearBottom(node));
    }

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    }

    update();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      mo.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [containerRef]);

  if (!show) return null;

  return (
    <button
      type="button"
      className="scroll-to-bottom"
      aria-label="Scroll to latest messages"
      title="Jump to latest"
      onClick={() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }}
    >
      <IconChevronDown size={18} />
    </button>
  );
}
