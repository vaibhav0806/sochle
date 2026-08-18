"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { checkPurchaseAction, type PurchaseCheckState } from "../_actions/check-purchase";
import { StatefulAction } from "./stateful-action";

type PurchaseCheckAction = (
  previous: PurchaseCheckState,
  formData: FormData
) => Promise<PurchaseCheckState>;

const initialPurchaseCheckState: PurchaseCheckState = { status: "idle" };

function recoveryLabel(href: string): string {
  if (href === "/rules") return "Finish your guardrails";
  if (href === "/login") return "Sign in";
  return "Connect your account";
}

export function PurchaseComposer({
  action = checkPurchaseAction,
  initialState = initialPurchaseCheckState,
}: {
  action?: PurchaseCheckAction;
  initialState?: PurchaseCheckState;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  return (
    <section className="purchase-composer">
      <form action={formAction} aria-label="Check a purchase" className="stack">
        <label>
          What are you considering?
          <input
            autoComplete="off"
            maxLength={120}
            name="description"
            onChange={(event) => setDescription(event.target.value)}
            required
            value={description}
          />
        </label>
        <label>
          Price in rupees
          <input
            inputMode="decimal"
            name="price"
            onChange={(event) => setPrice(event.target.value)}
            placeholder="45,000"
            required
            value={price}
          />
        </label>
        <StatefulAction pending={pending} type="submit">
          Does this fit?
        </StatefulAction>
      </form>

      {state.status === "error" && (
        <div aria-live="polite" className="notice error" role="status">
          <p>{state.message}</p>
          {state.recoveryHref !== null && (
            <Link href={state.recoveryHref}>{recoveryLabel(state.recoveryHref)}</Link>
          )}
        </div>
      )}

      {state.status === "success" && (
        <article aria-live="polite" className={`purchase-result tone-${state.presentation.tone}`}>
          <p className="eyebrow">{state.presentation.recencyLabel}</p>
          <h2>{state.presentation.title}</h2>
          <p>{state.presentation.consequence}</p>
          {state.presentation.suggestedAction !== null && (
            <p className="purchase-suggestion">{state.presentation.suggestedAction}</p>
          )}
          <details>
            <summary>See the maths</summary>
            <dl>
              {state.presentation.mathsRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Link href={`/decisions/${state.decisionId}`}>Full decision</Link>
        </article>
      )}
    </section>
  );
}
