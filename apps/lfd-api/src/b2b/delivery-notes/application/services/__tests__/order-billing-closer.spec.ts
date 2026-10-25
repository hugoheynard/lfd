import type { BillableAmounts } from "../../../../orders/domain/entities/billable-amounts.js";
import type { OrderBillingSnapshot } from "../../../../orders/domain/entities/order-billing.js";
import {
  FixedEngagements,
  InMemoryDeliveryNotes,
  InMemoryOrderBillings,
  RecordingSettlement,
  billingCloserOf,
} from "../../__tests__/delivery-note-doubles.js";
import type { BillingTally } from "../order-billing-closer.js";

/**
 * Le solde, côté comptabilité (lot E6c2, plan
 * `documentation/commandes/plan-e6c2-la-facture-lit-les-montants-facturables.md`
 * § 4) : la ligne d'encaissement suit la pose, et une commande ENGAGÉE n'est
 * plus corrigée — comptée, jamais tentée. Les jours ne sont comparés qu'entre
 * eux.
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

function remitted(billable: BillableAmounts | null): OrderBillingSnapshot {
  return {
    orderId: "ord_1",
    reference: "ORD-7",
    status: "fulfilled",
    partial: false,
    receivedOn: RECEIVED_ON,
    orderAmounts: AMOUNTS,
    billable,
    settledOn: billable === null ? null : RECEIVED_ON,
  };
}

function scene() {
  const billings = new InMemoryOrderBillings();
  const engagements = new FixedEngagements();
  const settlement = new RecordingSettlement();
  const closer = billingCloserOf(new InMemoryDeliveryNotes(), billings, engagements, settlement);
  const tally: BillingTally = { closed: 0, corrected: 0, compared: 0, gaps: [] };
  return { billings, engagements, settlement, closer, tally };
}

describe("OrderBillingCloser — l'encaissement et le gel (E6c2)", () => {
  it("à la remise, pose le solde puis recale l'encaissement sur le montant facturable", async () => {
    const { billings, settlement, closer } = scene();
    billings.put(remitted(null));

    await closer.closeLocked("ord_1");

    expect(billings.rows.get("ord_1")?.billable).toEqual(AMOUNTS);
    expect(settlement.aligned).toEqual([{ orderId: "ord_1", amountCents: 1_055 }]);
  });

  it("le rapprochement qui solde recale aussi l'encaissement", async () => {
    const { billings, settlement, closer, tally } = scene();
    billings.put(remitted(null));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.closed).toBe(1);
    expect(settlement.aligned).toEqual([{ orderId: "ord_1", amountCents: 1_055 }]);
  });

  /** Régression d'E6c1 : seule la facture comptait comme engagement ; un lot sans facture se corrigeait. */
  it("dans un lot sans facture, des montants faux ne sont pas corrigés : comptés, nommés « engagée »", async () => {
    const { billings, engagements, settlement, closer, tally } = scene();
    billings.put(remitted({ ...AMOUNTS, totalCents: 1 }));
    engagements.batched.add("ord_1");

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.corrected).toBe(0);
    expect(tally.gaps).toEqual([
      { orderId: "ord_1", orderNumber: "ORD-7", fields: ["totalCents"], engaged: true },
    ]);
    expect(billings.rows.get("ord_1")?.billable?.totalCents).toBe(1);
    expect(settlement.aligned).toEqual([]);
  });

  /**
   * Une ligne `excluded` est LIBRE (`engagementFrom`, une seule définition
   * d'« engagé », 2026-10-25) : la correction est tentée, aucun écart compté.
   */
  it("excluded (libre au port d'engagement) : corrigée, aucun écart compté", async () => {
    const { billings, closer, tally } = scene();
    billings.put(remitted({ ...AMOUNTS, totalCents: 1 }));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally).toMatchObject({ corrected: 1, gaps: [] });
    expect(billings.rows.get("ord_1")?.billable?.totalCents).toBe(1_055);
  });

  it("libre, des montants faux sont corrigés, et l'encaissement suit", async () => {
    const { billings, settlement, closer, tally } = scene();
    billings.put(remitted({ ...AMOUNTS, totalCents: 1 }));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.corrected).toBe(1);
    expect(settlement.aligned).toEqual([{ orderId: "ord_1", amountCents: 1_055 }]);
  });
});
