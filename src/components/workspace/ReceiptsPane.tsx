"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Client,
  PaymentMethodKind,
  ReceiptPayment,
  ReceiptProduct,
} from "@/lib/types";
import {
  paymentKindLabel,
  receiptListingStyle,
  receiptListingStyleHint,
  receiptListingStyleLabel,
  type ReceiptListingStyle,
} from "@/lib/spaceNormalize";
import { IconPencil, IconTrash, IconX } from "@/components/shared/Icons";
import { ReceiptCard } from "@/components/shared/ReceiptCard";

const PAYMENT_OPTIONS: PaymentMethodKind[] = [
  "url",
  "zelle",
  "venmo",
  "cashapp",
  "in_person",
  "other",
];

type SetupTab = "payments" | "products";

interface ReceiptsPaneProps {
  client?: Client;
  payments: ReceiptPayment[];
  products: ReceiptProduct[];
  onChangePayments: (payments: ReceiptPayment[]) => void;
  onChangeProducts: (products: ReceiptProduct[]) => void;
  onSendReceipt: (input: {
    product: ReceiptProduct;
    payment: ReceiptPayment;
  }) => void;
}

function productPlaceholders(style: ReceiptListingStyle | null) {
  if (style === "link") {
    return {
      title: "Name (e.g. Online booking deposit)",
      price: "Amount shown before Pay",
      note: "What’s included (optional)",
      link: "https://… checkout link for this product",
    };
  }
  if (style === "handle") {
    return {
      title: "Name (e.g. Color service)",
      price: "Amount to send",
      note: "Memo tip (optional)",
      link: "",
    };
  }
  if (style === "in_person") {
    return {
      title: "Name (e.g. Walk-in cut)",
      price: "Quoted amount (optional)",
      note: "Pay at counter / front desk",
      link: "",
    };
  }
  return {
    title: "Name (e.g. Balayage)",
    price: "Price (optional)",
    note: "Note (optional)",
    link: "",
  };
}

export function ReceiptsPane({
  client,
  payments,
  products,
  onChangePayments,
  onChangeProducts,
  onSendReceipt,
}: ReceiptsPaneProps) {
  const [productId, setProductId] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [editing, setEditing] = useState(false);
  const [setupTab, setSetupTab] = useState<SetupTab>("payments");
  const [productTitle, setProductTitle] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productNote, setProductNote] = useState("");
  const [productLink, setProductLink] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [payKind, setPayKind] = useState<PaymentMethodKind>("zelle");
  const [payLabel, setPayLabel] = useState("");
  const [payDetail, setPayDetail] = useState("");

  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );
  const selectedPayment = useMemo(
    () => payments.find((p) => p.id === paymentId),
    [payments, paymentId],
  );

  const draftStyle = receiptListingStyle(payKind);
  const primaryStyle = useMemo(() => {
    if (selectedPayment) return receiptListingStyle(selectedPayment.kind);
    if (payments[0]) return receiptListingStyle(payments[0].kind);
    return null;
  }, [payments, selectedPayment]);
  const usesProductLinks =
    payments.some((p) => p.kind === "url") ||
    (setupTab === "payments" && payKind === "url") ||
    primaryStyle === "link";

  const productHints = productPlaceholders(
    setupTab === "products" ? primaryStyle : draftStyle,
  );

  const previewProduct: ReceiptProduct = useMemo(
    () => ({
      id: "preview",
      title: productTitle.trim() || "Service name",
      ...(productPrice.trim()
        ? { price: productPrice.trim() }
        : { price: "$85" }),
      ...(productNote.trim()
        ? { note: productNote.trim() }
        : primaryStyle === "in_person" || draftStyle === "in_person"
          ? { note: "Pay at the counter" }
          : {}),
      ...(productLink.trim() && /^https?:\/\//i.test(productLink.trim())
        ? { linkUrl: productLink.trim() }
        : usesProductLinks
          ? { linkUrl: "https://pay.example.com/item" }
          : {}),
    }),
    [
      productTitle,
      productPrice,
      productNote,
      productLink,
      primaryStyle,
      draftStyle,
      usesProductLinks,
    ],
  );

  const previewPayment: ReceiptPayment = useMemo(() => {
    if (setupTab === "products" && selectedPayment) return selectedPayment;
    if (setupTab === "products" && payments[0]) return payments[0];
    return {
      id: "preview-pay",
      kind: payKind,
      label: payLabel.trim() || paymentKindLabel(payKind),
      detail:
        payDetail.trim() ||
        (payKind === "url"
          ? ""
          : payKind === "in_person"
            ? "Pay in person at the store"
            : "you@email.com"),
    };
  }, [
    setupTab,
    selectedPayment,
    payments,
    payKind,
    payLabel,
    payDetail,
  ]);

  function openEditor() {
    setEditing(true);
    setSetupTab("payments");
    setComposeError(null);
  }

  function addProduct() {
    const title = productTitle.trim();
    if (!title) return;
    const link = productLink.trim();
    if (usesProductLinks && primaryStyle === "link") {
      if (!link || !/^https?:\/\//i.test(link)) return;
    }
    const next: ReceiptProduct = {
      id: `prd-${Date.now().toString(36)}`,
      title,
      ...(productPrice.trim() ? { price: productPrice.trim() } : {}),
      ...(productNote.trim() ? { note: productNote.trim() } : {}),
      ...(link && /^https?:\/\//i.test(link) ? { linkUrl: link } : {}),
    };
    onChangeProducts([...products, next]);
    setProductId(next.id);
    setProductTitle("");
    setProductPrice("");
    setProductNote("");
    setProductLink("");
  }

  function addPayment() {
    const detail = payDetail.trim();
    const label = payLabel.trim() || paymentKindLabel(payKind);
    if (!detail && payKind !== "in_person" && payKind !== "url") return;
    const next: ReceiptPayment = {
      id: `pay-${Date.now().toString(36)}`,
      kind: payKind,
      label,
      detail:
        payKind === "url"
          ? ""
          : detail || "Pay in person at the store",
    };
    onChangePayments([...payments, next]);
    setPaymentId(next.id);
    setPayLabel("");
    setPayDetail("");
  }

  function send() {
    if (!client || client.chatEndedAt) return;
    if (!selectedProduct || !selectedPayment) return;
    if (selectedPayment.kind === "url") {
      const link = selectedProduct.linkUrl?.trim() ?? "";
      if (!link || !/^https?:\/\//i.test(link)) {
        setComposeError(
          "This product needs its own pay link — edit the product and add one.",
        );
        return;
      }
    }
    setComposeError(null);
    onSendReceipt({ product: selectedProduct, payment: selectedPayment });
  }

  const canSend = Boolean(
    client && !client.chatEndedAt && selectedProduct && selectedPayment,
  );

  return (
    <div className="receipts">
      <div className="receipts-head">
        <div className="receipts-head-row">
          <div>
            <h2>Billing</h2>
            <p>
              {client
                ? `Send an official receipt to ${client.name}`
                : "Open a chat to send a receipt"}
            </p>
          </div>
          <button
            type="button"
            className="library-edit-btn icon-btn"
            onClick={openEditor}
            aria-label="Edit receipts setup"
            title="Edit"
          >
            <IconPencil size={15} />
          </button>
        </div>
      </div>

      <div className="receipts-body">
        <section className="receipts-compose">
          {!client ? (
            <p className="receipts-hint">Open a chat to send a receipt.</p>
          ) : client.chatEndedAt ? (
            <p className="receipts-hint">This chat has ended.</p>
          ) : payments.length === 0 ? (
            <p className="receipts-hint">
              Tap Edit and add how customers pay first.
            </p>
          ) : products.length === 0 ? (
            <p className="receipts-hint">
              Payment is set — add a product or service next.
            </p>
          ) : (
            <>
              <label>
                <span>Payment</span>
                <select
                  value={selectedPayment?.id ?? ""}
                  onChange={(e) => {
                    setPaymentId(e.target.value);
                    setComposeError(null);
                  }}
                >
                  <option value="">Choose…</option>
                  {payments.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {` · ${receiptListingStyleLabel(receiptListingStyle(p.kind))}`}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPayment ? (
                <p className="receipts-style-hint">
                  {receiptListingStyleHint(
                    receiptListingStyle(selectedPayment.kind),
                  )}
                </p>
              ) : null}
              <label>
                <span>Product / service</span>
                <select
                  value={selectedProduct?.id ?? ""}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setComposeError(null);
                  }}
                >
                  <option value="">Choose…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.price ? ` · ${p.price}` : ""}
                      {p.linkUrl ? " · link" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {composeError ? (
                <p className="receipts-compose-error">{composeError}</p>
              ) : null}
              <button
                type="button"
                className="btn-solid receipts-send"
                disabled={!canSend}
                onClick={send}
              >
                Send official receipt
              </button>
            </>
          )}
        </section>
      </div>

      {editing ? (
        <div
          className="library-editor-backdrop"
          onClick={() => setEditing(false)}
        >
          <div
            className="library-editor-modal receipts-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="receipts-editor-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="library-editor-head">
              <div>
                <h2 id="receipts-editor-title">Edit receipts</h2>
                <p>
                  Start with payment — that sets how products show on the
                  receipt.
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost icon-btn"
                onClick={() => setEditing(false)}
                aria-label="Done"
                title="Done"
              >
                <IconX />
              </button>
            </header>

            <div
              className="library-editor-tabs"
              role="tablist"
              aria-label="Receipts setup"
            >
              <button
                type="button"
                role="tab"
                aria-selected={setupTab === "payments"}
                className={setupTab === "payments" ? "is-active" : undefined}
                onClick={() => setSetupTab("payments")}
              >
                1. Payments
                {payments.length ? (
                  <span className="receipts-tab-count">{payments.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={setupTab === "products"}
                className={setupTab === "products" ? "is-active" : undefined}
                onClick={() => setSetupTab("products")}
                disabled={payments.length === 0}
                title={
                  payments.length === 0
                    ? "Add a payment method first"
                    : undefined
                }
              >
                2. Products
                {products.length ? (
                  <span className="receipts-tab-count">{products.length}</span>
                ) : null}
              </button>
            </div>

            <div className="library-editor-body receipts-editor-body">
              {setupTab === "payments" ? (
                <section className="editor-block receipts-setup">
                  <p className="editor-hint">
                    Pick how this shop takes money. Each style shapes the
                    product listing on the receipt.
                  </p>

                  <div
                    className="receipts-kind-grid"
                    role="radiogroup"
                    aria-label="Payment style"
                  >
                    {PAYMENT_OPTIONS.map((kind) => {
                      const style = receiptListingStyle(kind);
                      const active = payKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`receipts-kind-chip${active ? " is-active" : ""}`}
                          onClick={() => setPayKind(kind)}
                        >
                          <strong>{paymentKindLabel(kind)}</strong>
                          <span>{receiptListingStyleLabel(style)}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="receipts-style-hint is-emphasis">
                    {receiptListingStyleHint(draftStyle)}
                  </p>

                  <ul className="receipts-list">
                    {payments.map((payment) => {
                      const style = receiptListingStyle(payment.kind);
                      return (
                        <li key={payment.id}>
                          <div>
                            <p className="receipts-list-title">
                              {payment.label}
                            </p>
                            <p className="receipts-list-meta">
                              {paymentKindLabel(payment.kind)} ·{" "}
                              {receiptListingStyleLabel(style)}
                              {payment.detail ? ` · ${payment.detail}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove ${payment.label}`}
                            onClick={() => {
                              const next = payments.filter(
                                (p) => p.id !== payment.id,
                              );
                              onChangePayments(next);
                              if (paymentId === payment.id) {
                                setPaymentId(next[0]?.id ?? "");
                              }
                            }}
                          >
                            <IconTrash size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {payments.length === 0 ? (
                    <p className="editor-hint">No payment methods yet.</p>
                  ) : null}

                  <div className="receipts-add">
                    <input
                      value={payLabel}
                      onChange={(e) => setPayLabel(e.target.value)}
                      placeholder="Label (optional)"
                    />
                    {payKind === "url" ? (
                      <p className="receipts-style-hint">
                        No shared URL here — you’ll set a pay link on each
                        product.
                      </p>
                    ) : (
                      <input
                        value={payDetail}
                        onChange={(e) => setPayDetail(e.target.value)}
                        placeholder={
                          payKind === "in_person"
                            ? "Pay at the counter"
                            : "Handle, email, or phone"
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="btn-solid"
                      onClick={addPayment}
                      disabled={
                        payKind !== "in_person" &&
                        payKind !== "url" &&
                        !payDetail.trim()
                      }
                    >
                      Add payment
                    </button>
                  </div>

                  <div className="receipts-preview">
                    <p className="receipts-preview-label">Receipt preview</p>
                    <ReceiptCard
                      receipt={{
                        productTitle: previewProduct.title,
                        productPrice: previewProduct.price,
                        productNote: previewProduct.note,
                        ...(previewProduct.linkUrl
                          ? { productLinkUrl: previewProduct.linkUrl }
                          : {}),
                        paymentKind: previewPayment.kind,
                        paymentLabel: previewPayment.label,
                        paymentDetail: previewPayment.detail,
                      }}
                      linkUrl={previewProduct.linkUrl}
                    />
                  </div>

                  {payments.length > 0 ? (
                    <button
                      type="button"
                      className="btn-solid receipts-next"
                      onClick={() => setSetupTab("products")}
                    >
                      Next: products
                    </button>
                  ) : null}
                </section>
              ) : (
                <section className="editor-block receipts-setup">
                  {payments.length === 0 ? (
                    <p className="editor-hint">
                      Add a payment method first — product listing style depends
                      on it.
                    </p>
                  ) : (
                    <>
                      <p className="editor-hint">
                        Items you attach to receipts. Listing style follows the
                        payment you pick when sending.
                      </p>
                      {primaryStyle ? (
                        <p className="receipts-style-hint is-emphasis">
                          Using{" "}
                          <strong>
                            {selectedPayment?.label ?? payments[0]?.label}
                          </strong>
                          : {receiptListingStyleHint(primaryStyle)}
                        </p>
                      ) : null}

                      <ul className="receipts-list">
                        {products.map((product) => (
                          <li key={product.id}>
                            <div>
                              <p className="receipts-list-title">
                                {product.title}
                              </p>
                              {product.price ? (
                                <p className="receipts-list-meta">
                                  {product.price}
                                </p>
                              ) : null}
                              {product.linkUrl ? (
                                <p className="receipts-list-meta">
                                  {product.linkUrl}
                                </p>
                              ) : null}
                              {product.note ? (
                                <p className="receipts-list-meta">
                                  {product.note}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove ${product.title}`}
                              onClick={() =>
                                onChangeProducts(
                                  products.filter((p) => p.id !== product.id),
                                )
                              }
                            >
                              <IconTrash size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      {products.length === 0 ? (
                        <p className="editor-hint">No products yet.</p>
                      ) : null}

                      <div className="receipts-add">
                        <input
                          value={productTitle}
                          onChange={(e) => setProductTitle(e.target.value)}
                          placeholder={productHints.title}
                        />
                        <input
                          value={productPrice}
                          onChange={(e) => setProductPrice(e.target.value)}
                          placeholder={productHints.price}
                        />
                        {primaryStyle === "link" ||
                        payments.some((p) => p.kind === "url") ? (
                          <input
                            value={productLink}
                            onChange={(e) => setProductLink(e.target.value)}
                            placeholder={
                              productHints.link ||
                              "https://… checkout link for this product"
                            }
                            inputMode="url"
                            autoComplete="url"
                          />
                        ) : null}
                        <input
                          value={productNote}
                          onChange={(e) => setProductNote(e.target.value)}
                          placeholder={productHints.note}
                        />
                        <button
                          type="button"
                          className="btn-solid"
                          onClick={addProduct}
                          disabled={
                            !productTitle.trim() ||
                            ((primaryStyle === "link" ||
                              payments.every((p) => p.kind === "url")) &&
                              !/^https?:\/\//i.test(productLink.trim()))
                          }
                        >
                          Add product
                        </button>
                      </div>

                      <div className="receipts-preview">
                        <p className="receipts-preview-label">Receipt preview</p>
                        <ReceiptCard
                          receipt={{
                            productTitle: previewProduct.title,
                            productPrice: previewProduct.price,
                            productNote: previewProduct.note,
                            ...(previewProduct.linkUrl
                              ? { productLinkUrl: previewProduct.linkUrl }
                              : {}),
                            paymentKind: previewPayment.kind,
                            paymentLabel: previewPayment.label,
                            paymentDetail: previewPayment.detail,
                          }}
                          linkUrl={previewProduct.linkUrl}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
