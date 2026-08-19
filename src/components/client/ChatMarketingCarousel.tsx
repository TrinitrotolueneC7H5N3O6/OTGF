"use client";

import { useEffect, useState } from "react";

interface ChatMarketingCarouselProps {
  images: string[];
}

export function ChatMarketingCarousel({ images }: ChatMarketingCarouselProps) {
  const slides = images.slice(0, 6);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div className="client-chat-carousel" aria-label="From this business">
      <div className="client-chat-carousel-stage">
        {slides.map((url, i) => (
          <div
            key={`${i}-${url.slice(0, 24)}`}
            className={`client-chat-carousel-slide ${i === index ? "is-active" : ""}`}
            aria-hidden={i !== index}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" />
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <div className="client-chat-carousel-dots" role="tablist" aria-label="Photos">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Photo ${i + 1}`}
              className={i === index ? "is-active" : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
