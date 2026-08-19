"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

const REVEAL_MAX = 92;
const AXIS_LOCK = 6;

interface SwipeTimeStreamProps {
  children: ReactNode;
  empty?: ReactNode;
  isEmpty?: boolean;
}

/**
 * Messenger-style stream: timestamps stay hidden until you press and
 * drag left; release snaps them away again.
 */
export const SwipeTimeStream = forwardRef<HTMLDivElement, SwipeTimeStreamProps>(
  function SwipeTimeStream({ children, empty, isEmpty }, ref) {
    const [reveal, setReveal] = useState(0);
    const [dragging, setDragging] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const revealRef = useRef(0);
    const dragRef = useRef<{
      id: number;
      x: number;
      y: number;
      origin: number;
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
      const next = Math.max(0, Math.min(REVEAL_MAX, px));
      revealRef.current = next;
      setReveal(next);
      setDragging(isDrag);
    }, []);

    function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      if (isEmpty) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragRef.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        origin: revealRef.current,
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
        // Lock to horizontal when movement is mostly sideways (esp. left)
        if (Math.abs(dx) >= Math.abs(dy)) {
          drag.axis = "x";
          e.currentTarget.setPointerCapture(e.pointerId);
        } else {
          drag.axis = "y";
          return;
        }
      }

      if (drag.axis !== "x") return;

      // Drag left (dx < 0) opens the time column
      applyReveal(drag.origin - dx, true);
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
        applyReveal(0, false);
      }
    }

    useEffect(() => {
      applyReveal(0, false);
    }, [isEmpty, applyReveal]);

    // Non-passive touchmove so horizontal drag isn't stolen by scroll
    useEffect(() => {
      const root = scrollRef.current;
      if (!root || isEmpty) return;

      const onTouchMove = (e: TouchEvent) => {
        const drag = dragRef.current;
        if (drag?.axis === "x") e.preventDefault();
      };

      root.addEventListener("touchmove", onTouchMove, { passive: false });
      return () => root.removeEventListener("touchmove", onTouchMove);
    }, [isEmpty]);

    const paneStyle = {
      ["--time-reveal" as string]: `${reveal}px`,
    } as CSSProperties;

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
          <div
            className={
              reveal > 8
                ? "client-chat-pane is-times-visible"
                : "client-chat-pane"
            }
            style={paneStyle}
          >
            {children}
          </div>
        )}
      </div>
    );
  },
);
