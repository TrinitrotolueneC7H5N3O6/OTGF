import type { ChatBanner } from "@/lib/types";

const TONE_STYLE: Record<
  Exclude<ChatBanner["tone"], "custom">,
  { background: string; color: string }
> = {
  flash: { background: "#ffe600", color: "#111111" },
  promo: { background: "#ff2d55", color: "#ffffff" },
  sale: { background: "#111111", color: "#ffe600" },
  urgent: { background: "#ff3b00", color: "#ffffff" },
  ink: { background: "#16181d", color: "#ffffff" },
};

export function bannerColors(banner: ChatBanner): {
  background: string;
  color: string;
} {
  if (banner.tone === "custom") {
    return {
      background: banner.bg || "#ff2d55",
      color: banner.color || "#ffffff",
    };
  }
  return TONE_STYLE[banner.tone] ?? TONE_STYLE.promo;
}

interface ChatBannerViewProps {
  banner: ChatBanner;
  className?: string;
}

export function ChatBannerView({ banner, className }: ChatBannerViewProps) {
  const colors = bannerColors(banner);
  const size = banner.size === "md" ? "is-md" : "is-lg";
  const classes = ["chat-shout", `chat-shout-${banner.tone}`, size];
  if (className) classes.push(className);

  return (
    <div
      className={classes.join(" ")}
      role="status"
      style={{
        background: colors.background,
        color: colors.color,
      }}
    >
      {banner.label ? (
        <span className="chat-shout-label">{banner.label}</span>
      ) : null}
      <p className="chat-shout-text">{banner.text}</p>
    </div>
  );
}
