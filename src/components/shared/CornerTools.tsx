"use client";

import { DbToggle } from "./DbToggle";
import { FeedbackWidget } from "./FeedbackWidget";

export function CornerTools() {
  return (
    <div className="corner-tools">
      <DbToggle />
      <FeedbackWidget />
    </div>
  );
}
