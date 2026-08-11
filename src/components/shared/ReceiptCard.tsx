"use client";

import type { ReceiptPayload } from "@/lib/types";
import {
  paymentKindLabel,
  receiptListingStyle,
} from "@/lib/spaceNormalize";

interface ReceiptCardProps {
  receipt: ReceiptPayload;
  linkUrl?: string;
  compact?: boolean;
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

export function ReceiptCard({ receipt, linkUrl, compact }: ReceiptCardProps) {
  const style = receiptListingStyle(receipt.paymentKind);
  const payUrl =
    linkUrl ||
    receipt.productLinkUrl ||
    (receipt.paymentKind === "url" && looksLikeUrl(receipt.paymentDetail)
      ? receipt.paymentDetail
      : undefined);
  const payName =
    receipt.paymentLabel || paymentKindLabel(receipt.paymentKind);

  return (
    <div
      className={`receipt-card is-${style}${compact ? " is-compact" : ""}`}
    >
      <p className="receipt-card-eyebrow">
        {style === "in_person"
          ? "In-person receipt"
          : style === "link"
            ? "Pay link"
            : "Official receipt"}
      </p>

      <h3 className="receipt-card-title">{receipt.productTitle}</h3>

      {receipt.productPrice ? (
        <p className="receipt-card-price">
          {style === "handle" ? (
            <>
              <span className="receipt-card-price-label">Send</span>{" "}
              {receipt.productPrice}
            </>
          ) : (
            receipt.productPrice
          )}
        </p>
      ) : null}

      {receipt.productNote ? (
        <p className="receipt-card-note">{receipt.productNote}</p>
      ) : null}

      <div className="receipt-card-pay">
        {style === "link" ? (
          <>
            <p className="receipt-card-pay-label">{payName}</p>
            {payUrl ? (
              <a
                className="receipt-card-pay-link"
                href={payUrl}
                target="_blank"
                rel="noreferrer"
              >
                Pay now
              </a>
            ) : (
              <p className="receipt-card-pay-detail">
                Pay link set per product
              </p>
            )}
          </>
        ) : null}

        {style === "handle" ? (
          <>
            <p className="receipt-card-pay-label">
              {paymentKindLabel(receipt.paymentKind)}
              {receipt.paymentLabel &&
              receipt.paymentLabel !== paymentKindLabel(receipt.paymentKind)
                ? ` · ${receipt.paymentLabel}`
                : ""}
            </p>
            {receipt.paymentDetail ? (
              <p className="receipt-card-pay-handle">{receipt.paymentDetail}</p>
            ) : (
              <p className="receipt-card-pay-detail">{payName}</p>
            )}
          </>
        ) : null}

        {style === "in_person" ? (
          <>
            <p className="receipt-card-pay-label">Pay in person</p>
            <p className="receipt-card-pay-detail">
              {receipt.paymentDetail || payName}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
