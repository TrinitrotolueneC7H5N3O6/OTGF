"use client";

import {
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Message } from "@/lib/types";
import {
  IconChevronLeft,
  IconChevronRight,
  IconX,
} from "@/components/shared/Icons";

interface MessageMediaProps {
  message: Message;
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

  return createPortal(
    <div
      className="photo-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${total}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="photo-lightbox-close"
        aria-label="Close"
        onClick={onClose}
      >
        <IconX size={18} />
      </button>

      {total > 1 ? (
        <>
          <button
            type="button"
            className="photo-lightbox-nav is-prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              onIndexChange((index - 1 + total) % total);
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
              onIndexChange((index + 1) % total);
            }}
          >
            <IconChevronRight size={22} />
          </button>
        </>
      ) : null}

      <div
        className="photo-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
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

function ImageFanCarousel({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const total = urls.length;
  const depth = Math.min(3, total);

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
            setOpen(true);
          }}
        >
          <div className="bubble-fan-stack">
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

export function MessageMedia({ message }: MessageMediaProps) {
  const [singleOpen, setSingleOpen] = useState(false);

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
    return <ImageFanCarousel urls={gallery} />;
  }

  if (message.imageUrl) {
    return (
      <>
        <div className="bubble-media">
          <button
            type="button"
            className="bubble-image-open"
            aria-label="View photo full screen"
            onClick={(e) => {
              e.stopPropagation();
              setSingleOpen(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={message.imageUrl} alt="" className="bubble-image" />
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
    return (
      <div className="bubble-link">
        <a href={message.linkUrl} target="_blank" rel="noreferrer">
          {message.linkUrl}
        </a>
      </div>
    );
  }

  return null;
}
