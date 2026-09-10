"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Message } from "@/lib/types";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconX,
} from "@/components/shared/Icons";
import { InAppLink } from "@/components/shared/LinkSheet";

interface MessageMediaProps {
  message: Message;
  suppressOpen?: boolean;
}

function useImageAspect(url?: string) {
  const [aspect, setAspect] = useState("4 / 3");

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
      setAspect(`${img.naturalWidth} / ${img.naturalHeight}`);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return aspect;
}

function PhotoLightbox({
  urls,
  index,
  onIndexChange,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const total = urls.length;
  const dragStartRef = useRef<{
    x: number;
    y: number;
    id: number;
    axis: "pending" | "x" | "y";
  } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);

  function go(delta: number) {
    onIndexChange((index + delta + total) % total);
  }

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && total > 1) {
        e.preventDefault();
        onIndexChange((index - 1 + total) % total);
      } else if (e.key === "ArrowRight" && total > 1) {
        e.preventDefault();
        onIndexChange((index + 1) % total);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [index, total, onClose, onIndexChange]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      axis: "pending",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.axis === "pending") {
      if (Math.hypot(dx, dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (start.axis === "x" && total > 1) {
      event.preventDefault();
      setDragX(Math.max(-140, Math.min(140, dx)));
      return;
    }

    if (start.axis === "y" && dy > 0) {
      event.preventDefault();
      setDragY(Math.min(140, dy));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const axis = start.axis;
    dragStartRef.current = null;
    setDragX(0);
    setDragY(0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    if (axis === "x" && total > 1 && Math.abs(dx) > 52) {
      event.preventDefault();
      event.stopPropagation();
      go(dx < 0 ? 1 : -1);
    } else if (axis === "y" && dy > 64) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return createPortal(
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${total}`}
      onClick={onClose}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
    >
      <div className="photo-lightbox-actions">
        <a
          className="photo-lightbox-action"
          href={urls[index]}
          download="chat-photo.jpg"
          aria-label="Download photo"
          onClick={(e) => e.stopPropagation()}
        >
          <IconDownload size={18} />
        </a>
        <button
          type="button"
          className="photo-lightbox-action"
          aria-label="Close"
          onClick={onClose}
        >
          <IconX size={18} />
        </button>
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            className="photo-lightbox-nav is-prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          >
            <IconChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="photo-lightbox-nav is-next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          >
            <IconChevronRight size={22} />
          </button>
        </>
      ) : null}

      <div
        className={`photo-lightbox-stage${dragX || dragY ? " is-dragging" : ""}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={
          dragX || dragY
            ? {
                transform: `translate3d(${dragX}px, ${dragY}px, 0) scale(${Math.max(
                  0.92,
                  1 - Math.max(Math.abs(dragX), dragY) / 900,
                )})`,
                opacity: Math.max(
                  0.45,
                  1 - Math.max(Math.abs(dragX), dragY) / 320,
                ),
              }
            : undefined
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={urls[index]}
          src={urls[index]}
          alt=""
          className="photo-lightbox-img"
        />
      </div>

      {total > 1 ? (
        <p className="photo-lightbox-count">
          {index + 1} / {total}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}

function ImageFanCarousel({
  urls,
  suppressOpen = false,
}: {
  urls: string[];
  suppressOpen?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const total = urls.length;
  const depth = Math.min(3, total);
  const aspect = useImageAspect(urls[index]);

  function go(delta: number, e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setIndex((i) => (i + delta + total) % total);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  }

  const behind = Array.from({ length: depth - 1 }, (_, i) => {
    const fan = i + 1;
    const srcIndex = (index + fan) % total;
    return { fan, src: urls[srcIndex], key: `${srcIndex}-${fan}-${index}` };
  }).reverse();

  return (
    <>
      <div
        className="bubble-media bubble-fan"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Photo ${index + 1} of ${total}. Click to view full size.`}
        onKeyDown={onKey}
      >
        <button
          type="button"
          className="bubble-fan-open"
          aria-label="View photos full screen"
          onClick={(e) => {
            e.stopPropagation();
            if (suppressOpen) return;
            setOpen(true);
          }}
        >
          <div className="bubble-fan-stack" style={{ aspectRatio: aspect }}>
            {behind.map(({ fan, src, key }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={key}
                src={src}
                alt=""
                className={`bubble-fan-card is-fan-${fan}`}
                aria-hidden
                draggable={false}
              />
            ))}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`front-${index}`}
              src={urls[index]}
              alt=""
              className="bubble-fan-card is-fan-0 is-front"
              draggable={false}
            />
          </div>
        </button>

        <button
          type="button"
          className="bubble-fan-nav is-prev"
          aria-label="Previous photo"
          onClick={(e) => go(-1, e)}
        >
          <IconChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="bubble-fan-nav is-next"
          aria-label="Next photo"
          onClick={(e) => go(1, e)}
        >
          <IconChevronRight size={16} />
        </button>

        <span className="bubble-fan-count">
          {index + 1} / {total}
        </span>
      </div>

      {open ? (
        <PhotoLightbox
          urls={urls}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function MessageMedia({
  message,
  suppressOpen = false,
}: MessageMediaProps) {
  const [singleOpen, setSingleOpen] = useState(false);
  const imageTapStartRef = useRef<{ x: number; y: number; at: number } | null>(null);

  if (message.kind === "video" && message.videoUrl) {
    return (
      <div className="bubble-media">
        <video
          src={message.videoUrl}
          controls
          playsInline
          className="bubble-video"
        />
      </div>
    );
  }

  const gallery =
    message.imageUrls && message.imageUrls.length > 1
      ? message.imageUrls
      : null;

  if (gallery) {
    return (
      <ImageFanCarousel
        urls={gallery}
        suppressOpen={suppressOpen}
      />
    );
  }

  if (message.imageUrl) {
    return (
      <>
        <div className="bubble-media">
          <button
            type="button"
            className="bubble-image-open"
            aria-label="View photo full screen"
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return;
              imageTapStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                at: Date.now(),
              };
            }}
            onPointerUpCapture={(e) => {
              if (e.pointerType === "mouse") return;
              const start = imageTapStartRef.current;
              imageTapStartRef.current = null;
              if (!start || suppressOpen) return;
              const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
              const elapsed = Date.now() - start.at;
              if (moved < 10 && elapsed < 360) {
                setSingleOpen(true);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressOpen) return;
              setSingleOpen(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.imageUrl}
              alt=""
              className="bubble-image"
              draggable={false}
            />
          </button>
        </div>
        {singleOpen ? (
          <PhotoLightbox
            urls={[message.imageUrl]}
            index={0}
            onIndexChange={() => {}}
            onClose={() => setSingleOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (message.kind === "link" && message.linkUrl) {
    const label = message.body.trim() || "Document";
    const download = message.linkUrl.startsWith("data:") ? label : undefined;
    if (download) {
      return (
        <div className="bubble-file">
          <a href={message.linkUrl} download={download}>
            {label}
          </a>
        </div>
      );
    }
    return (
      <div className="bubble-file">
        <InAppLink href={message.linkUrl} target="_blank" rel="noreferrer">
          {label}
        </InAppLink>
      </div>
    );
  }

  return null;
}
