import type { BillableAmounts } from "../../../../orders/domain/entities/billable-amounts.js";
import type { OrderBillingSnapshot } from "../../../../orders/domain/entities/order-billing.js";
import {
  FixedEngagements,
  FixedShortfallRefunds,
  InMemoryDeliveryNotes,
  InMemoryOrderBillings,
  RecordingBillingFacts,
  RecordingSettlement,
  billingCloserOf,
} from "../../__tests__/delivery-note-doubles.js";
import type { BillingTally } from "../order-billing-closer.js";

/**
 * **Le gel du solde par le reste demandé à la carte** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.7) : dès
 * qu'une demande `shortfall` existe, dans n'importe quel état, le solde dont
 * elle a tiré son montant ne se corrige plus — l'écart est compté, « engagé »,
 * et aucun fait ne réveille l'abonné. Les jours ne sont comparés qu'entre eux.
 */

const RECEIVED_ON = "2030-01-10";
const AMOUNTS: BillableAmounts = {
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  lateFeeCents: 0,
  vatCents: 55,
  vatShares: [{ rate: 5.5, amountCents: 55 }],
  totalCents: 1_055,
};

function settled(): OrderBillingSnapshot {
  return {
    orderId: "ord_1",
    reference: "ORD-7",
    status: "fulfilled",
    partial: false,
    receivedOn: RECEIVED_ON,
    orderAmounts: AMOUNTS,
    billable: { ...AMOUNTS, totalCents: 1 },
    settledOn: RECEIVED_ON,
  };
}

function scene(requested: ReadonlySet<string>) {
  const billings = new InMemoryOrderBillings();
  const facts = new RecordingBillingFacts();
  const closer = billingCloserOf(
    new InMemoryDeliveryNotes(),
    billings,
    new FixedEngagements(),
    new RecordingSettlement(),
    facts,
    new FixedShortfallRefunds(requested),
  );
  const tally: BillingTally = { closed: 0, corrected: 0, compared: 0, gaps: [] };
  billings.put(settled());
  return { billings, facts, closer, tally };
}

describe("OrderBillingCloser — le reste demandé gèle le solde (plan E9, § 4.7)", () => {
  it("une demande `shortfall` existe : rien n'est corrigé, l'écart est compté « engagé », aucun fait", async () => {
    const { billings, facts, closer, tally } = scene(new Set(["ord_1"]));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.corrected).toBe(0);
    expect(tally.gaps).toEqual([
      { orderId: "ord_1", orderNumber: "ORD-7", fields: ["totalCents"], engaged: true },
    ]);
    expect(billings.rows.get("ord_1")?.billable?.totalCents).toBe(1);
    expect(facts.published).toEqual([]);
  });

  it("sans demande du reste, la même commande libre se corrige, et le fait part", async () => {
    const { billings, facts, closer, tally } = scene(new Set());

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.corrected).toBe(1);
    expect(billings.rows.get("ord_1")?.billable?.totalCents).toBe(1_055);
    expect(facts.published.map((fact) => fact.type)).toEqual(["order.billing_settled"]);
  });
});
