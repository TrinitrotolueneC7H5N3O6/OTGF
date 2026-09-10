"use client";

import { usePathname } from "next/navigation";
import { DbToggle } from "./DbToggle";
import { FeedbackWidget } from "./FeedbackWidget";

export function CornerTools() {
  const pathname = usePathname();
  if (pathname?.includes("/embed")) return null;

  return (
    <div className="corner-tools">
      <DbToggle />
      <FeedbackWidget />
    </div>
  );
}
