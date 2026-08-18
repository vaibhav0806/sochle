import type {
  ExtensionDecisionCard,
  ExtensionSession,
  ExtractedProduct,
  ProductDecisionRequest,
  PurchaseOutcome,
} from "@sochle/contracts/browser";
import { useEffect, useRef, useState } from "react";

import { parseInrPrice } from "../adapters";

type DecisionCardProps = {
  onEvaluate(request: ProductDecisionRequest): Promise<ExtensionDecisionCard>;
  onOpenApp(url: string): void;
  onOutcome(intentId: string, outcome: PurchaseOutcome): Promise<{ status: PurchaseOutcome }>;
  product: ExtractedProduct;
  session: ExtensionSession;
};

type Phase = "detected" | "checking" | "error" | "result";

function formatMoney(minor: number): string {
  return new Intl.NumberFormat("en-IN", { currency: "INR", style: "currency" }).format(minor / 100);
}

function inputPrice(product: ExtractedProduct): string {
  return product.price === null
    ? ""
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
        product.price.minor / 100
      );
}

export function DecisionCard({
  onEvaluate,
  onOpenApp,
  onOutcome,
  product,
  session,
}: DecisionCardProps) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [title, setTitle] = useState(product.title);
  const [price, setPrice] = useState(inputPrice(product));
  const [phase, setPhase] = useState<Phase>("detected");
  const [result, setResult] = useState<ExtensionDecisionCard | null>(null);
  const [savedOutcome, setSavedOutcome] = useState<PurchaseOutcome | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    setOpen(false);
    setDismissed(false);
    setTitle(product.title);
    setPrice(inputPrice(product));
    setPhase("detected");
    setResult(null);
    setSavedOutcome(null);
    idempotencyKey.current = crypto.randomUUID();
  }, [product.canonicalUrl, product.title, product.price?.minor]);

  const correctedPrice = parseInrPrice(`INR ${price}`);
  const canCheck =
    session.kind === "paired" &&
    session.ready &&
    title.trim().length > 0 &&
    title.trim().length <= 120 &&
    correctedPrice !== null &&
    phase !== "checking";
  const uncertainTitle = product.confidence !== "high";
  const uncertainPrice = product.confidence !== "high" || product.price === null;

  async function checkPurchase() {
    if (!canCheck || correctedPrice === null) return;
    setPhase("checking");
    try {
      const next = await onEvaluate({
        correctedPrice,
        correctedTitle: title.trim(),
        extracted: product,
        idempotencyKey: idempotencyKey.current,
      });
      setResult(next);
      setPhase("result");
    } catch {
      setPhase("error");
    }
  }

  async function saveOutcome(outcome: PurchaseOutcome) {
    if (result === null) return;
    try {
      const saved = await onOutcome(result.intentId, outcome);
      setSavedOutcome(saved.status);
    } catch {
      setPhase("error");
    }
  }

  if (dismissed) return null;
  if (!open) {
    return (
      <button className="sochle-trigger" onClick={() => setOpen(true)} type="button">
        सोचle
      </button>
    );
  }

  return (
    <aside aria-label="Sochle purchase check" className="sochle-card">
      <header>
        <span className="sochle-eyebrow">सोचle before checkout</span>
        <button className="sochle-close" onClick={() => setDismissed(true)} type="button">
          Dismiss
        </button>
      </header>

      {session.kind === "unpaired" || !session.ready ? (
        <div className="sochle-stack">
          <strong>
            {session.kind === "unpaired" ? "Pair Sochle to start." : "Finish setup first."}
          </strong>
          <p>
            {session.kind === "unpaired"
              ? "Approve this browser once, then come straight back."
              : "Sochle needs your guardrails and latest account picture before it can answer."}
          </p>
          <button onClick={() => onOpenApp(session.appUrl)} type="button">
            Open Sochle
          </button>
        </div>
      ) : phase === "result" && result !== null ? (
        <div className="sochle-stack sochle-result" aria-live="polite">
          <span className="sochle-recency">{result.presentation.recencyLabel}</span>
          <strong className="sochle-verdict">{result.presentation.title}</strong>
          <p>{result.presentation.consequence}</p>
          {result.presentation.suggestedAction !== null && (
            <p className="sochle-action">{result.presentation.suggestedAction}</p>
          )}
          <details>
            <summary>See the maths</summary>
            <dl>
              {result.presentation.mathsRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="sochle-outcomes" aria-label="What did you decide?">
            <span>What now?</span>
            <button onClick={() => saveOutcome("purchased")} type="button">
              Buy
            </button>
            <button onClick={() => saveOutcome("waiting")} type="button">
              Wait
            </button>
            <button onClick={() => saveOutcome("skipped")} type="button">
              Pass
            </button>
            <button
              className="sochle-not-relevant"
              onClick={() => saveOutcome("not_relevant")}
              type="button"
            >
              Not relevant
            </button>
          </div>
          {savedOutcome !== null && <p className="sochle-saved">Saved</p>}
          <button
            className="sochle-link"
            onClick={() => onOpenApp(result.decisionUrl)}
            type="button"
          >
            Full decision in Sochle →
          </button>
        </div>
      ) : (
        <div className="sochle-stack">
          <div className="sochle-product">
            {product.imageUrl != null && <img alt="" src={product.imageUrl} />}
            <div>
              {uncertainTitle ? (
                <label>
                  Product
                  <input
                    maxLength={120}
                    onChange={(event) => setTitle(event.target.value)}
                    value={title}
                  />
                </label>
              ) : (
                <strong>{title}</strong>
              )}
              {uncertainPrice ? (
                <label>
                  Price in rupees
                  <input
                    inputMode="decimal"
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="45,000"
                    value={price}
                  />
                </label>
              ) : (
                <span>{formatMoney(product.price!.minor)}</span>
              )}
            </div>
          </div>
          {phase === "checking" && <p aria-live="polite">Thoda soch rahe hain…</p>}
          {phase === "error" && (
            <p role="alert">That check didn’t go through. Your changes are still here.</p>
          )}
          <button disabled={!canCheck} onClick={checkPurchase} type="button">
            {phase === "checking"
              ? "Checking…"
              : phase === "error"
                ? "Try again"
                : "Check this purchase"}
          </button>
        </div>
      )}
    </aside>
  );
}
