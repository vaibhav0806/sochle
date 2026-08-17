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

const freshnessLabel: Record<ExtensionDecisionCard["freshness"], string | null> = {
  aging: "Aging financial data",
  fresh: null,
  missing: "Missing financial data",
  stale: "Stale financial data",
};

function formatMoney(minor: number): string {
  return new Intl.NumberFormat("en-IN", { currency: "INR", style: "currency" }).format(minor / 100);
}

function inputPrice(product: ExtractedProduct): string {
  if (product.price === null) return "";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    product.price.minor / 100
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Sochle could not finish that check.";
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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtensionDecisionCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOutcome, setSavedOutcome] = useState<PurchaseOutcome | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    setOpen(false);
    setDismissed(false);
    setTitle(product.title);
    setPrice(inputPrice(product));
    setLoading(false);
    setResult(null);
    setExpanded(false);
    setError(null);
    setSavedOutcome(null);
    idempotencyKey.current = crypto.randomUUID();
  }, [product.canonicalUrl, product.title, product.price?.minor]);

  const correctedPrice = parseInrPrice(`INR ${price}`);
  const canCalculate =
    session.kind === "paired" &&
    session.ready &&
    title.trim().length > 0 &&
    title.trim().length <= 120 &&
    correctedPrice !== null &&
    !loading;

  async function calculate() {
    if (!canCalculate || correctedPrice === null) return;
    setLoading(true);
    setError(null);
    try {
      setResult(
        await onEvaluate({
          correctedPrice,
          correctedTitle: title.trim(),
          extracted: product,
          idempotencyKey: idempotencyKey.current,
        })
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLoading(false);
    }
  }

  async function saveOutcome(outcome: PurchaseOutcome) {
    if (result === null) return;
    setError(null);
    try {
      const saved = await onOutcome(result.intentId, outcome);
      setSavedOutcome(saved.status);
    } catch (reason) {
      setError(message(reason));
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
        <div>
          <span className="sochle-eyebrow">सोचle before checkout</span>
          <strong>{result?.headline ?? "Ek quick money check?"}</strong>
        </div>
        <button className="sochle-close" onClick={() => setDismissed(true)} type="button">
          Dismiss
        </button>
      </header>

      {session.kind === "unpaired" || !session.ready ? (
        <div className="sochle-stack">
          <p>
            {session.kind === "unpaired"
              ? "Pair Sochle from the extension first."
              : "Rules or money snapshot missing—app mein setup finish karo."}
          </p>
          <button onClick={() => onOpenApp(session.appUrl)} type="button">
            Open Sochle
          </button>
        </div>
      ) : result === null ? (
        <div className="sochle-stack">
          <label>
            Product
            <input
              aria-label="Product"
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label>
            Price in rupees
            <input
              aria-label="Price in rupees"
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 45,000"
              value={price}
            />
          </label>
          {product.confidence !== "high" && (
            <p className="sochle-note">Product extraction confidence: {product.confidence}</p>
          )}
          {error !== null && <p role="alert">{error}</p>}
          <button disabled={!canCalculate} onClick={calculate} type="button">
            {loading ? "Doing the maths…" : error === null ? "Calculate" : "Try again"}
          </button>
        </div>
      ) : (
        <div className="sochle-stack">
          <p>{result.primaryTradeoff}</p>
          <div className="sochle-badges">
            <span>
              {result.confidence === "low" ? "Low confidence" : `${result.confidence} confidence`}
            </span>
            {freshnessLabel[result.freshness] !== null && (
              <span>{freshnessLabel[result.freshness]}</span>
            )}
          </div>
          {result.primaryAction !== null && <p className="sochle-action">{result.primaryAction}</p>}
          <button className="sochle-secondary" onClick={() => setExpanded(!expanded)} type="button">
            {expanded ? "Hide the maths" : "Show the maths"}
          </button>
          {expanded && (
            <dl>
              <div>
                <dt>Price checked</dt>
                <dd>{formatMoney(result.priceMinor)}</dd>
              </div>
              <div>
                <dt>Safe to spend</dt>
                <dd>{formatMoney(result.safeToSpendMinor)}</dd>
              </div>
              <div>
                <dt>Projected liquidity</dt>
                <dd>{formatMoney(result.projectedLiquidityMinor)}</dd>
              </div>
              <div>
                <dt>Buffer headroom</dt>
                <dd>{formatMoney(result.bufferHeadroomMinor)}</dd>
              </div>
            </dl>
          )}
          <div className="sochle-outcomes" aria-label="What did you decide?">
            <span>What now?</span>
            <button onClick={() => saveOutcome("waiting")} type="button">
              Wait
            </button>
            <button onClick={() => saveOutcome("purchased")} type="button">
              Bought it
            </button>
            <button onClick={() => saveOutcome("skipped")} type="button">
              Skip
            </button>
            <button onClick={() => saveOutcome("not_relevant")} type="button">
              Not relevant
            </button>
          </div>
          {savedOutcome !== null && <p className="sochle-saved">Saved: {savedOutcome}</p>}
          {error !== null && <p role="alert">{error}</p>}
          <button
            className="sochle-link"
            onClick={() => onOpenApp(result.decisionUrl)}
            type="button"
          >
            Full decision in Sochle →
          </button>
        </div>
      )}
    </aside>
  );
}
