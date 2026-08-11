"use client";

import type {
  Artifact,
  Client,
  LibraryCategory,
  Message,
  ReceiptPayment,
  ReceiptProduct,
} from "@/lib/types";
import { LibraryPane } from "./LibraryPane";
import { AssistPane } from "./AssistPane";
import { ReceiptsPane } from "./ReceiptsPane";

export type RightTab = "artifacts" | "assist" | "receipts";

interface RightPaneProps {
  tab: RightTab;
  onTabChange: (tab: RightTab) => void;
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
  receiptPayments: ReceiptPayment[];
  receiptProducts: ReceiptProduct[];
  onChangeReceiptPayments: (payments: ReceiptPayment[]) => void;
  onChangeReceiptProducts: (products: ReceiptProduct[]) => void;
  onSendReceipt: (input: {
    product: ReceiptProduct;
    payment: ReceiptPayment;
  }) => void;
}

export function RightPane({
  tab,
  onTabChange,
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
  receiptPayments,
  receiptProducts,
  onChangeReceiptPayments,
  onChangeReceiptProducts,
  onSendReceipt,
}: RightPaneProps) {
  return (
    <div className="right-pane">
      <div className="right-pane-tabs" role="tablist" aria-label="Side tools">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "artifacts"}
          className={tab === "artifacts" ? "is-active" : undefined}
          onClick={() => onTabChange("artifacts")}
        >
          Artifacts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assist"}
          className={tab === "assist" ? "is-active" : undefined}
          onClick={() => onTabChange("assist")}
        >
          Assist
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "receipts"}
          className={tab === "receipts" ? "is-active" : undefined}
          onClick={() => onTabChange("receipts")}
        >
          Receipts
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
        ) : null}
        {tab === "assist" ? (
          <AssistPane
            client={activeClient}
            messages={thread}
            artifacts={artifacts}
            businessName={businessName}
            trade={trade}
            behavior={assistBehavior}
            onChangeBehavior={onChangeAssistBehavior}
            onUseSuggestion={(text) => {
              onUseSuggestion(text);
              onTabChange("assist");
            }}
          />
        ) : null}
        {tab === "receipts" ? (
          <ReceiptsPane
            client={activeClient}
            payments={receiptPayments}
            products={receiptProducts}
            onChangePayments={onChangeReceiptPayments}
            onChangeProducts={onChangeReceiptProducts}
            onSendReceipt={(input) => {
              onSendReceipt(input);
              onTabChange("receipts");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
