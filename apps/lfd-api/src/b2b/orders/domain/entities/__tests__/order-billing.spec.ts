import type { BillableAmounts } from "../billable-amounts.js";
import {
  OrderBilling,
  type HandedOverNoteAmounts,
  type OrderBillingSnapshot,
} from "../order-billing.js";

const ORDER_AMOUNTS: BillableAmounts = {
  subtotalCents: 10_000,
  discountCents: 1_000,
  voucherDiscountCents: 0,
  deliveryFeeCents: 800,
  lateFeeCents: 0,
  vatCents: 539,
  vatShares: [{ rate: 5.5, amountCents: 539 }],
  totalCents: 10_339,
};
const PARTIAL_AMOUNTS: BillableAmounts = {
  subtotalCents: 7_500,
  discountCents: 750,
  voucherDiscountCents: 0,
  deliveryFeeCents: 800,
  lateFeeCents: 0,
  vatCents: 415,
  vatShares: [{ rate: 5.5, amountCents: 415 }],
  totalCents: 7_965,
};
// Jours comparés entre eux, jamais à l'horloge.
const RECEIVED_ON = "2030-01-10";

function billing(overrides: Partial<OrderBillingSnapshot> = {}): OrderBilling {
  return OrderBilling.fromSnapshot({
    orderId: "ord_1",
    reference: "ORD-0001",
    status: "fulfilled",
    partial: false,
    receivedOn: RECEIVED_ON,
    orderAmounts: ORDER_AMOUNTS,
    billable: null,
    settledOn: null,
    ...overrides,
  });
}

const HANDED: readonly HandedOverNoteAmounts[] = [
  { number: "BL-0001-1", receivedOn: RECEIVED_ON, amounts: PARTIAL_AMOUNTS },
];

describe("OrderBilling.closeBilling — la commande soldée (E6c1)", () => {
  it("une commande à un BL complet : la recopie exacte de ses totaux, au jour de réception", () => {
    const solde = billing();

    expect(solde.closeBilling(HANDED)).toBe(true);
    expect(solde.toSnapshot()).toMatchObject({ billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON });
    expect(solde.pendingWrite).toBe("closed");
  });

  it("une commande décidée : la somme des BL remis, au jour du dernier", () => {
    const solde = billing({ partial: true });

    expect(solde.closeBilling(HANDED)).toBe(true);
    expect(solde.toSnapshot()).toMatchObject({ billable: PARTIAL_AMOUNTS, settledOn: RECEIVED_ON });
  });

  it("additionne plusieurs BL remis, la TVA par taux comprise", () => {
    const solde = billing({ partial: true });
    const second = {
      number: "BL-0001-2",
      receivedOn: "2030-01-12",
      amounts: { ...PARTIAL_AMOUNTS, vatShares: [{ rate: 20, amountCents: 10 }] },
    };

    solde.closeBilling([...HANDED, second]);

    expect(solde.toSnapshot()).toMatchObject({
      settledOn: "2030-01-12",
      billable: {
        subtotalCents: 15_000,
        totalCents: 15_930,
        vatShares: [
          { rate: 5.5, amountCents: 415 },
          { rate: 20, amountCents: 10 },
        ],
      },
    });
  });

  it.each(["cancelled", "ready", "confirmed"] as const)(
    "une commande « %s » n'est jamais soldée",
    (status) => {
      const solde = billing({ status });
      expect(solde.closeBilling(HANDED)).toBe(false);
      expect(solde.pendingWrite).toBeNull();
    },
  );

  it("une commande décidée dont le BL n'est pas remis n'est pas soldée", () => {
    expect(billing({ partial: true }).closeBilling([])).toBe(false);
  });

  it("un BL remis sans en-tête (avant E4a) ne solde pas une commande décidée", () => {
    const old = [{ number: "BL-0001-1", receivedOn: RECEIVED_ON, amounts: null }];
    expect(billing({ partial: true }).closeBilling(old)).toBe(false);
  });

  it("un BL remis sans jour de réception ne solde pas : un écart nommé, pas un oubli", () => {
    const solde = billing({ partial: true });
    const noDay = [{ number: "BL-0001-1", receivedOn: null, amounts: PARTIAL_AMOUNTS }];

    expect(solde.closeBilling(noDay)).toBe(false);
    expect(solde.settlementGapOf(noDay)).toBe("receivedOn");
    expect(billing({ partial: true }).settlementGapOf(HANDED)).toBeNull();
  });

  it("ne repose pas des montants déjà posés", () => {
    const solde = billing({ billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON });
    expect(solde.closeBilling(HANDED)).toBe(false);
  });
});

describe("OrderBilling — contrôle et correction (E6c1)", () => {
  it("ne compte aucun écart quand les montants posés sont ceux de la règle", () => {
    expect(billing({ billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON }).gapsOf(HANDED)).toEqual([]);
  });

  it("nomme les champs en écart", () => {
    const wrong = { ...ORDER_AMOUNTS, totalCents: 1 };
    expect(billing({ billable: wrong, settledOn: "2030-01-11" }).gapsOf(HANDED)).toEqual([
      "totalCents",
      "settledOn",
    ]);
  });

  it("corrige un écart tant que rien n'est facturé", () => {
    const solde = billing({
      billable: { ...ORDER_AMOUNTS, totalCents: 1 },
      settledOn: RECEIVED_ON,
    });

    expect(solde.correctBilling(HANDED, false)).toBe(true);
    expect(solde.toSnapshot().billable).toEqual(ORDER_AMOUNTS);
    expect(solde.pendingWrite).toBe("corrected");
  });

  it("ne corrige jamais une commande déjà facturée", () => {
    const solde = billing({
      billable: { ...ORDER_AMOUNTS, totalCents: 1 },
      settledOn: RECEIVED_ON,
    });
    expect(solde.correctBilling(HANDED, true)).toBe(false);
  });

  it("des montants posés sur une commande annulée depuis sont un écart « settlement »", () => {
    const solde = billing({ status: "cancelled", billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON });
    expect(solde.gapsOf(HANDED)).toEqual(["settlement"]);
  });
});

describe("OrderBilling — frontières du solde", () => {
  it("une commande remise sans jour de réception n'est pas soldée (attente, pas écart)", () => {
    const solde = billing({ receivedOn: null });
    expect(solde.closeBilling([])).toBe(false);
    expect(solde.settlementGapOf([])).toBeNull();
  });

  it("une somme dont un BL n'a pas de ventilation n'en invente pas", () => {
    const solde = billing({ partial: true });
    const bare = {
      number: "BL-2",
      receivedOn: RECEIVED_ON,
      amounts: { ...PARTIAL_AMOUNTS, vatShares: null },
    };
    solde.closeBilling([...HANDED, bare]);
    expect(solde.toSnapshot().billable?.vatShares).toBeNull();
    expect(solde.toSnapshot().billable?.subtotalCents).toBe(15_000);
  });

  it("le jour du solde est le dernier, quel que soit l'ordre des BL", () => {
    const solde = billing({ partial: true });
    const later = { number: "BL-2", receivedOn: "2030-02-01", amounts: PARTIAL_AMOUNTS };
    solde.closeBilling([later, ...HANDED]);
    expect(solde.toSnapshot().settledOn).toBe("2030-02-01");
  });

  it("nomme l'écart d'un BL remis sans jour, puis sans en-tête, et rien hors commande décidée remise", () => {
    const partial = billing({ partial: true });
    expect(
      partial.settlementGapOf([{ number: "BL", receivedOn: null, amounts: PARTIAL_AMOUNTS }]),
    ).toBe("receivedOn");
    expect(
      partial.settlementGapOf([{ number: "BL", receivedOn: RECEIVED_ON, amounts: null }]),
    ).toBe("terms");
    expect(partial.settlementGapOf(HANDED)).toBeNull();
    expect(
      billing({ partial: true, status: "confirmed" }).settlementGapOf([
        { number: "BL", receivedOn: null, amounts: null },
      ]),
    ).toBeNull();
  });

  it("une ventilation TVA posée dans un autre ordre n'est pas un écart", () => {
    const shares = [
      { rate: 5.5, amountCents: 400 },
      { rate: 20, amountCents: 139 },
    ];
    const solde = billing({
      orderAmounts: { ...ORDER_AMOUNTS, vatShares: shares },
      billable: { ...ORDER_AMOUNTS, vatShares: [...shares].reverse() },
      settledOn: RECEIVED_ON,
    });
    expect(solde.gapsOf([])).toEqual([]);
  });

  it("une ventilation absente contre présente est un écart « vatShares »", () => {
    const solde = billing({
      billable: { ...ORDER_AMOUNTS, vatShares: null },
      settledOn: RECEIVED_ON,
    });
    expect(solde.gapsOf([])).toEqual(["vatShares"]);
  });

  it("ne corrige rien quand les montants concordent, et corrige un jour de solde faux", () => {
    const exact = billing({ billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON });
    expect(exact.correctBilling([], false)).toBe(false);
    expect(exact.pendingWrite).toBeNull();
    const late = billing({ billable: ORDER_AMOUNTS, settledOn: "2030-01-11" });
    expect(late.correctBilling([], false)).toBe(true);
    expect(late.toSnapshot().settledOn).toBe(RECEIVED_ON);
  });

  it("ne corrige pas des montants posés sur une commande annulée depuis", () => {
    const solde = billing({ status: "cancelled", billable: ORDER_AMOUNTS, settledOn: RECEIVED_ON });
    expect(solde.correctBilling([], false)).toBe(false);
  });
});
