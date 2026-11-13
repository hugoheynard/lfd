import type { BillableAmounts } from "../../../../orders/domain/entities/billable-amounts.js";
import type { OrderBillingSnapshot } from "../../../../orders/domain/entities/order-billing.js";
import {
  ORDER_BILLING_SETTLED,
  OrderBillingSettledFact,
} from "../../../../orders/domain/events/order-billing-settled.fact.js";
import {
  FixedEngagements,
  InMemoryDeliveryNotes,
  InMemoryOrderBillings,
  RecordingBillingFacts,
  RecordingSettlement,
  billingCloserOf,
} from "../../__tests__/delivery-note-doubles.js";
import type { BillingTally } from "../order-billing-closer.js";

/**
 * `order.billing_settled` (plan E9, lot F, § 3.5) : publié à chaque écriture
 * du solde — pose et correction —, jamais sur un `save` refusé ni sur un
 * écart gelé ; une clé par écriture. Les jours ne sont comparés qu'entre eux.
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
  const facts = new RecordingBillingFacts();
  const closer = billingCloserOf(
    new InMemoryDeliveryNotes(),
    billings,
    engagements,
    new RecordingSettlement(),
    facts,
  );
  const tally: BillingTally = { closed: 0, corrected: 0, compared: 0, gaps: [] };
  return { billings, engagements, facts, closer, tally };
}

describe("OrderBillingCloser — le fait order.billing_settled", () => {
  it("à la remise, la pose publie le fait avec le facturable et le jour", async () => {
    const { billings, facts, closer } = scene();
    billings.put(remitted(null));

    await closer.closeLocked("ord_1");

    expect(facts.published).toEqual([
      {
        type: ORDER_BILLING_SETTLED,
        key: "order.billing_settled:write_000001",
        payload: {
          orderId: "ord_1",
          write: "closed",
          billableTotalCents: 1_055,
          settledOn: RECEIVED_ON,
        },
      },
    ]);
  });

  it("la pose du rapprochement publie aussi le fait", async () => {
    const { billings, facts, closer, tally } = scene();
    billings.put(remitted(null));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(facts.published.map((fact) => fact.payload["write"])).toEqual(["closed"]);
  });

  it("une correction publie le fait `corrected`", async () => {
    const { billings, facts, closer, tally } = scene();
    billings.put(remitted({ ...AMOUNTS, totalCents: 1 }));

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(facts.published.map((fact) => fact.payload["write"])).toEqual(["corrected"]);
  });

  it("un écart gelé (commande engagée) ne publie rien", async () => {
    const { billings, engagements, facts, closer, tally } = scene();
    billings.put(remitted({ ...AMOUNTS, totalCents: 1 }));
    engagements.invoiced.add("ord_1");

    await closer.reconcile(["ord_1"], [], tally, 10);

    expect(tally.gaps).toHaveLength(1);
    expect(facts.published).toEqual([]);
  });

  it("un solde déjà posé (save refusé, rien à écrire) ne publie rien", async () => {
    const { billings, facts, closer } = scene();
    billings.put(remitted(AMOUNTS));

    await closer.closeLocked("ord_1");

    expect(facts.published).toEqual([]);
  });

  it("une commande ni remise ni soldable ne publie rien", async () => {
    const { billings, facts, closer } = scene();
    billings.put({ ...remitted(null), status: "confirmed", receivedOn: null });

    await closer.closeLocked("ord_1");

    expect(facts.published).toEqual([]);
  });

  /**
   * Une clé dérivée du contenu (`orderId:total:jour`) avalerait le second fait
   * d'un aller-retour A → B → A, ou d'une correction de TVA seule.
   */
  it("deux écritures au même contenu portent deux clés distinctes", async () => {
    const { billings, facts, closer, tally } = scene();
    billings.put(remitted(null));
    await closer.closeLocked("ord_1");
    billings.put(remitted({ ...AMOUNTS, vatCents: 54 }));
    await closer.reconcile(["ord_1"], [], tally, 10);

    const [first, second] = facts.published;
    expect(first?.payload).toEqual({ ...second?.payload, write: "closed" });
    expect(first?.key).not.toBe(second?.key);
  });
});

describe("OrderBillingSettledFact.orderIdOf", () => {
  it("rend la commande d'un payload bien formé", () => {
    const fact = new OrderBillingSettledFact("w1", "ord_1", "corrected", 10, RECEIVED_ON);
    expect(OrderBillingSettledFact.orderIdOf(fact.durableFact().payload)).toBe("ord_1");
  });

  it("refuse un payload sans commande ou d'écriture inconnue", () => {
    expect(() => OrderBillingSettledFact.orderIdOf({ write: "closed" })).toThrow(
      /order\.billing_settled/,
    );
    expect(() => OrderBillingSettledFact.orderIdOf({ orderId: "o", write: "x" })).toThrow(
      /order\.billing_settled/,
    );
  });
});
