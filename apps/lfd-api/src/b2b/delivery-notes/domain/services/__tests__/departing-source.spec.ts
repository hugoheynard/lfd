import type { DecidedDeparture } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import type { DeliveryNoteSource } from "../../entities/delivery-note.js";
import { DecisionOutsideOrderError } from "../../errors/delivery-note-errors.js";
import type { DeliveryNoteSourceLine } from "../../value-objects/delivery-note-line.js";
import { ORDER_TERMS } from "../../value-objects/__tests__/delivery-note-terms.fixture.js";
import { departingSourceOf } from "../departing-source.js";

/** 1,00 € HT la pièce, 5,5 % — des totaux qui se lisent de tête. */
function line(sku: string, quantity: number, eligible = true): DeliveryNoteSourceLine {
  return {
    sku,
    productName: sku,
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    quantity,
    lineTotalCents: quantity * 100,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: eligible,
  };
}

const ORDER: DeliveryNoteSource = {
  orderId: "ord_1",
  orderNumber: "ORD-0001",
  lines: [line("CRO", 10), line("PAC", 10, false)],
  terms: ORDER_TERMS,
};

const NO_RULES = { discount: null, deliveryFee: null, lateFee: null, deliveryVatMode: null };

function decided(
  departing: DecidedDeparture["departing"],
  adjustments: Partial<DecidedDeparture["adjustments"]> = {},
): DecidedDeparture {
  return { departing, adjustments: { ...NO_RULES, ...adjustments } };
}

describe("departingSourceOf — le BL d'une commande décidée (E6b, § 13)", () => {
  it("sans décision, la commande telle quelle", () => {
    expect(departingSourceOf(ORDER, undefined)).toBe(ORDER);
  });

  it("réduit les lignes aux quantités décidées ; une ligne qui ne part pas reste, à zéro", () => {
    const source = departingSourceOf(
      ORDER,
      decided([
        { sku: "CRO", quantity: 6 },
        { sku: "PAC", quantity: 0 },
      ]),
    );

    expect(source.lines.map((l) => [l.sku, l.quantity, l.lineTotalCents])).toEqual([
      ["CRO", 6, 600],
      ["PAC", 0, 0],
    ]);
    expect(source.terms).toMatchObject({ subtotalCents: 600, totalCents: 633, vatCents: 33 });
    expect(source.departureDecided).toBe(true);
  });

  it("répartit un article sur ses lignes dans l'ordre, la première d'abord", () => {
    const twice = { ...ORDER, lines: [line("CRO", 4), line("CRO", 4)] };
    const source = departingSourceOf(twice, decided([{ sku: "CRO", quantity: 5 }]));
    expect(source.lines.map((l) => l.quantity)).toEqual([4, 1]);
  });

  it("refuse une décision au-delà de la commande", () => {
    expect(() => departingSourceOf(ORDER, decided([{ sku: "CRO", quantity: 11 }]))).toThrow(
      DecisionOutsideOrderError,
    );
  });

  it("est idempotente", () => {
    const decision = decided([{ sku: "CRO", quantity: 6 }]);
    const once = departingSourceOf(ORDER, decision);
    expect(departingSourceOf(once, decision)).toEqual(once);
  });
});

describe("DeliveryNoteTerms.composePartial — les montants de ce qui part (§ 9.2, § 11)", () => {
  const SIX = [
    { sku: "CRO", quantity: 6 },
    { sku: "PAC", quantity: 10 },
  ];

  it("une remise en pourcentage suit le livré, sur l'assiette ÉLIGIBLE de la ligne de commande", () => {
    const { terms } = departingSourceOf(
      ORDER,
      decided(SIX, { discount: { mode: "percent", bp: 1_000 } }),
    );
    // 10 % de 6,00 € (CRO seul est éligible) — PAC ne compte pas.
    expect(terms.discountCents).toBe(60);
    expect(terms.subtotalCents).toBe(1_600);
  });

  it("une remise fixe reste entière, plafonnée à l'assiette éligible qui part (Q-E6-2)", () => {
    const entire = departingSourceOf(
      ORDER,
      decided(SIX, { discount: { mode: "amount", cents: 500 } }),
    );
    expect(entire.terms.discountCents).toBe(500);

    const capped = departingSourceOf(
      ORDER,
      decided([{ sku: "CRO", quantity: 3 }], { discount: { mode: "amount", cents: 500 } }),
    );
    expect(capped.terms.discountCents).toBe(300);
  });

  it("des frais fixes restent entiers ; des frais en pourcentage suivent le livré (Q-E6-1)", () => {
    const fixed = departingSourceOf(
      ORDER,
      decided(SIX, { deliveryFee: { mode: "amount", cents: 800 } }),
    );
    expect(fixed.terms.deliveryFeeCents).toBe(800);

    const percent = departingSourceOf(
      ORDER,
      decided(SIX, { deliveryFee: { mode: "percent", bp: 1_000 } }),
    );
    expect(percent.terms.deliveryFeeCents).toBe(160);
  });

  it("la surtaxe garde son taux figé, et le mode de TVA du port est celui de la commande", () => {
    const { terms } = departingSourceOf(
      ORDER,
      decided(SIX, {
        lateFee: { adjustment: { mode: "amount", cents: 200 }, vatRatePercent: 20 },
        deliveryVatMode: "standard",
      }),
    );
    expect(terms).toMatchObject({
      lateFeeCents: 200,
      lateFeeAdjustment: { adjustment: { mode: "amount", cents: 200 }, vatRatePercent: 20 },
      deliveryVatMode: "standard",
      voucherDiscountCents: 0,
    });
    // 16,00 € à 5,5 % + 2,00 € à 20 %.
    expect(terms.vatCents).toBe(88 + 40);
    expect(terms.totalCents).toBe(1_600 + 200 + 128);
  });
});

describe("departingSourceOf — frontières", () => {
  it("un article décidé à zéro et inconnu de la commande n'est pas hors commande", () => {
    expect(() =>
      departingSourceOf(
        ORDER,
        decided([
          { sku: "FANTOME", quantity: 0 },
          { sku: "CRO", quantity: 1 },
        ]),
      ),
    ).not.toThrow();
  });

  it("un article absent de la commande, à quantité positive, est refusé", () => {
    expect(() => departingSourceOf(ORDER, decided([{ sku: "FANTOME", quantity: 1 }]))).toThrow(
      DecisionOutsideOrderError,
    );
  });

  it("une décision sans aucun article laisse chaque ligne à zéro (rien ne part)", () => {
    const source = departingSourceOf(ORDER, decided([]));
    expect(source.lines.map((l) => [l.quantity, l.lineTotalCents])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(source.terms.subtotalCents).toBe(0);
    expect(source.terms.totalCents).toBe(0);
  });

  it("la décision complète rend les lignes de la commande telles quelles", () => {
    const source = departingSourceOf(
      ORDER,
      decided([
        { sku: "CRO", quantity: 10 },
        { sku: "PAC", quantity: 10 },
      ]),
    );
    expect(source.lines).toEqual(ORDER.lines);
  });

  // Le TTC d'une ligne réduite se recalcule depuis son HT réduit, jamais par
  // proportion du TTC de la ligne de commande (l'arrondi se multiplierait).
  it("le TTC d'une ligne réduite vient de son HT réduit, et reste null s'il l'était", () => {
    const priced: DeliveryNoteSourceLine = {
      ...line("CRO", 12),
      unitPriceMillicents: 81_818,
      vatRate: 10,
      lineTotalCents: 982,
      lineTotalTtcCents: 1_080,
    };
    const source = departingSourceOf(
      { ...ORDER, lines: [priced, line("PAC", 1)] },
      decided([{ sku: "CRO", quantity: 7 }]),
    );
    const [reduced, other] = source.lines;
    expect(reduced?.lineTotalCents).toBe(573);
    expect(reduced?.lineTotalTtcCents).toBe(630);
    expect(other?.lineTotalTtcCents).toBeNull();
  });
});
