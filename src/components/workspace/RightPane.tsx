"use client";

import { useState } from "react";
import type {
  Artifact,
  Client,
  LibraryCategory,
  Message,
} from "@/lib/types";
import { LibraryPane } from "./LibraryPane";
import { AssistPane } from "./AssistPane";

type RightTab = "artifacts" | "assist";

interface RightPaneProps {
  categories: LibraryCategory[];
  artifacts: Artifact[];
  filter: string;
  onFilterChange: (value: string) => void;
  onStageArtifact: (item: Artifact) => void;
  onChangeLibrary: (next: {
    categories: LibraryCategory[];
    artifacts: Artifact[];
  }) => void;
  sentFlash: string | null;
  activeClient?: Client;
  thread: Message[];
  businessName: string;
  trade: string;
  assistBehavior: string;
  onChangeAssistBehavior: (behavior: string) => void;
  onUseSuggestion: (text: string) => void;
}

export function RightPane({
  categories,
  artifacts,
  filter,
  onFilterChange,
  onStageArtifact,
  onChangeLibrary,
  sentFlash,
  activeClient,
  thread,
  businessName,
  trade,
  assistBehavior,
  onChangeAssistBehavior,
  onUseSuggestion,
}: RightPaneProps) {
  const [tab, setTab] = useState<RightTab>("artifacts");

  return (
    <div className="right-pane">
      <div className="right-pane-tabs" role="tablist" aria-label="Side tools">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "artifacts"}
          className={tab === "artifacts" ? "is-active" : undefined}
          onClick={() => setTab("artifacts")}
        >
          Artifacts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assist"}
          className={tab === "assist" ? "is-active" : undefined}
          onClick={() => setTab("assist")}
        >
          Assist
        </button>
      </div>

      <div className="right-pane-body">
        {tab === "artifacts" ? (
          <LibraryPane
            categories={categories}
            artifacts={artifacts}
            filter={filter}
            onFilterChange={onFilterChange}
            onSend={onStageArtifact}
            onChange={onChangeLibrary}
            sentFlash={sentFlash}
            activeClientName={activeClient?.name}
          />
        ) : (
          <AssistPane
            client={activeClient}
            messages={thread}
            businessName={businessName}
            trade={trade}
            behavior={assistBehavior}
            onChangeBehavior={onChangeAssistBehavior}
            onUseSuggestion={(text) => {
              onUseSuggestion(text);
              setTab("assist");
            }}
          />
        )}
      </div>
    </div>
  );
}
