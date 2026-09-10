"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

const REVEAL_MAX = 72;
const MOBILE_REVEAL = 56;
const AXIS_LOCK = 4;
/** Finger travel → UI travel. iMessage tracks well under 1:1. */
const DRAG_GAIN = 0.45;

interface SwipeTimeStreamProps {
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

function maxRevealPx() {
  return window.matchMedia("(max-width: 640px)").matches
    ? Math.min(MOBILE_REVEAL, window.innerWidth * 0.15)
    : REVEAL_MAX;
}

/** Damped follow, then iOS rubber-band once the column is fully open. */
function mapDrag(fingerLeft: number, max: number) {
  if (fingerLeft <= 0) return 0;
  const followed = fingerLeft * DRAG_GAIN;
  if (followed <= max) return followed;
  const extra = followed - max;
  return max + extra / (1 + extra / (max * 0.55));
}

/**
 * Messenger-style stream: timestamps stay hidden until you press and
 * drag left; release snaps them away again.
 */
export const SwipeTimeStream = forwardRef<HTMLDivElement, SwipeTimeStreamProps>(
  function SwipeTimeStream({ children, empty, isEmpty }, ref) {
    const [dragging, setDragging] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const paneRef = useRef<HTMLDivElement | null>(null);
    const revealRef = useRef(0);
    const draggingRef = useRef(false);
    const dragRef = useRef<{
      id: number;
      x: number;
      y: number;
      originFinger: number;
      axis: "pending" | "x" | "y";
    } | null>(null);

    const setNode = useCallback(
      (node: HTMLDivElement | null) => {
        scrollRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const applyReveal = useCallback((px: number, isDrag: boolean) => {
      const pane = paneRef.current;
      const max = maxRevealPx();
      revealRef.current = px;
      if (isDrag && !draggingRef.current) {
        draggingRef.current = true;
        scrollRef.current?.classList.add("is-dragging");
        setDragging(true);
      }
      if (pane) {
        pane.style.setProperty("--time-col", `${max}px`);
        pane.style.setProperty("--time-reveal", `${px}px`);
      }
    }, []);

    const snapClosed = useCallback(() => {
      const stream = scrollRef.current;
      draggingRef.current = false;
      stream?.classList.remove("is-dragging");
      setDragging(false);
      if (stream) void stream.offsetWidth;
      revealRef.current = 0;
      if (paneRef.current) {
        paneRef.current.style.setProperty("--time-col", `${maxRevealPx()}px`);
        paneRef.current.style.setProperty("--time-reveal", "0px");
      }
    }, []);

    function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      if (isEmpty) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragRef.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        originFinger: revealRef.current / DRAG_GAIN,
        axis: "pending",
      };
    }

    function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId) return;

      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;

      if (drag.axis === "pending") {
        if (Math.hypot(dx, dy) < AXIS_LOCK) return;
        if (Math.abs(dx) >= Math.abs(dy)) {
          drag.axis = "x";
          e.currentTarget.setPointerCapture(e.pointerId);
        } else {
          drag.axis = "y";
          return;
        }
      }

      if (drag.axis !== "x") return;

      e.preventDefault();
      applyReveal(mapDrag(drag.originFinger - dx, maxRevealPx()), true);
    }

    function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
      const drag = dragRef.current;
      if (!drag || drag.id !== e.pointerId) return;
      const wasX = drag.axis === "x";
      dragRef.current = null;
      if (wasX) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        snapClosed();
      }
    }

    useEffect(() => {
      snapClosed();
    }, [isEmpty, snapClosed]);

    useEffect(() => {
      const root = scrollRef.current;
      if (!root || isEmpty) return;

      const onTouchMove = (e: TouchEvent) => {
        if (dragRef.current?.axis === "x") e.preventDefault();
      };

      root.addEventListener("touchmove", onTouchMove, { passive: false });
      return () => root.removeEventListener("touchmove", onTouchMove);
    }, [isEmpty]);

    return (
      <div
        ref={setNode}
        className={
          dragging ? "client-chat-stream is-dragging" : "client-chat-stream"
        }
        role="log"
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {isEmpty ? (
          empty
        ) : (
          <div ref={paneRef} className="client-chat-pane">
            {children}
          </div>
        )}
      </div>
    );
  },
);
