import { PurchaseComposer } from "../_components/purchase-composer";
import { requireOwnerPage } from "../../lib/server/auth";

export const dynamic = "force-dynamic";

export default async function CheckPage() {
  await requireOwnerPage();

  return (
    <main className="narrow">
      <p className="eyebrow">Think before checkout</p>
      <h1>Does this fit?</h1>
      <p>Tell Sochle what you’re considering and get a clear answer without leaving the page.</p>
      <PurchaseComposer />
    </main>
  );
}
