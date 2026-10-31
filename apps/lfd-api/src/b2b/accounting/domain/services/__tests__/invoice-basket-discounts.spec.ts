import type { InvoiceVatBreakdown } from "@lfd/money";

import { issueInput } from "../../entities/__tests__/invoice-fixtures.js";
import { Invoice } from "../../entities/invoice.js";
import { facturXArithmeticViolations } from "../facturx-arithmetic.js";
import { renderFacturXml } from "../facturx-xml.js";
import { BASKET_PROMOTION_PREFIX } from "../invoice-discount-allowances.js";
import { COMPANY_DISCOUNT, LOYALTY_VOUCHER, simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceDiscount, FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { frozenBon, goodsLine } from "./per-order-cycle-fixtures.js";

/**
 * **Plusieurs remises de panier sur une facture** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.4, Q-M2 et Q-M3, lot M5.
 *
 * La preuve centrale : un bon d'UNE remise rend la facture, sa ventilation et
 * son XML d'hier, au caractère près — qu'on lui donne ses remises ou non.
 * Les dates ne sont comparées qu'entre elles (Q-M2 : le bon le plus ancien).
 */

const PAIN = 5.5;
const JUS = 20;
const P1 = "promo_01";
const P2 = "promo_02";

function lines() {
  return [goodsLine("PAIN", PAIN, 1_000), goodsLine("JUS", JUS, 500)];
}

function discount(
  promotionId: string | null,
  label: string | null,
  parts: FrozenInvoiceDiscount["parts"],
): FrozenInvoiceDiscount {
  return { promotionId, label, parts };
}

/** Rang 1 : P1 sur les deux taux (150 c) ; rang 2 : P2 sur le pain seul (45 c). */
function twoDiscountBon(
  reference: string,
  at: number,
  p1Label = "Retrait -10 %",
): FrozenInvoiceOrder {
  return {
    ...frozenBon({ reference, lines: lines(), pickupDiscountCents: 195, voucherCents: 30 }),
    createdAt: new Date(at),
    basketDiscounts: [
      discount(P1, p1Label, [
        { rate: PAIN, amountCents: 100 },
        { rate: JUS, amountCents: 50 },
      ]),
      discount(P2, "Fidélité pain", [{ rate: PAIN, amountCents: 45 }]),
    ],
  };
}

function oneDiscountBon(reference: string, at: number, label: string | null): FrozenInvoiceOrder {
  return {
    ...frozenBon({ reference, lines: lines(), pickupDiscountCents: 120 }),
    createdAt: new Date(at),
    basketDiscounts: [discount(P1, label, null)],
  };
}

function xmlOf(orders: readonly FrozenInvoiceOrder[]): string {
  const { invoice } = simulateInvoiceDossier(orders);
  return renderFacturXml(
    Invoice.issue(
      issueInput({
        lines: invoice.lines.map((l) => ({
          sku: l.sku,
          label: l.label,
          unitCode: l.unitCode,
          quantityThousandths: l.quantityThousandths,
          unitPriceMillicents: l.unitPriceMillicents,
          vatRate: l.vatRate,
          amountCents: l.amountCents,
        })),
        vat: invoice.vat,
      }),
    ),
  );
}

function partAt(vat: InvoiceVatBreakdown, key: string, rate: number): number {
  const category = vat.categories.find((c) => c.rate === rate);
  return category?.allowances.find((part) => part.key === key)?.amountCents ?? 0;
}

describe("facture — une seule remise de panier : celle d'hier, au caractère près", () => {
  const without = frozenBon({ reference: "B-1", lines: lines(), pickupDiscountCents: 120 });
  const withOne: FrozenInvoiceOrder = {
    ...without,
    basketDiscounts: [discount(P1, "Retrait -10 %", [{ rate: PAIN, amountCents: 120 }])],
  };

  it("rend la même facture et la même ventilation", () => {
    expect(simulateInvoiceDossier([withOne])).toEqual(simulateInvoiceDossier([without]));
  });

  it("rend le même XML Factur-X, « Remise client » compris", () => {
    const xml = xmlOf([withOne]);
    expect(xml).toBe(xmlOf([without]));
    expect(xml).toContain("<ram:Reason>Remise client</ram:Reason>");
  });

  it("ne porte aucun libellé dans la ventilation figée", () => {
    const { vat } = simulateInvoiceDossier([withOne]).invoice;
    expect(vat.categories.flatMap((c) => c.allowances).every((p) => !("label" in p))).toBe(true);
  });
});

describe("facture — deux remises de panier sur un bon", () => {
  const bon = twoDiscountBon("B-2", 1_000);
  const dossier = simulateInvoiceDossier([bon]);
  const { vat } = dossier.invoice;
  const xml = xmlOf([bon]);

  it("garde les parts figées de chaque promotion, taux par taux", () => {
    expect(partAt(vat, `${BASKET_PROMOTION_PREFIX}${P1}`, PAIN)).toBe(100);
    expect(partAt(vat, `${BASKET_PROMOTION_PREFIX}${P1}`, JUS)).toBe(50);
    expect(partAt(vat, `${BASKET_PROMOTION_PREFIX}${P2}`, PAIN)).toBe(45);
    expect(partAt(vat, COMPANY_DISCOUNT, PAIN)).toBe(0);
  });

  it("découpe le bon de fidélité sur ce que les remises laissent", () => {
    // Net : pain 1000 − 145 = 855, jus 500 − 50 = 450 ; 30 c au prorata.
    expect(partAt(vat, LOYALTY_VOUCHER, PAIN) + partAt(vat, LOYALTY_VOUCHER, JUS)).toBe(30);
    expect(partAt(vat, LOYALTY_VOUCHER, PAIN)).toBe(20);
  });

  it("garde le total de la remise société et le bon cohérent", () => {
    expect(dossier.invoice.companyDiscountCents).toBe(195);
    expect(dossier.threeGapInvariantHolds).toBe(true);
  });

  it("écrit une BG-20 par promotion et par taux, motif = libellé figé", () => {
    const reasons = [...xml.matchAll(/<ram:Reason>([^<]*)<\/ram:Reason>/gu)].map((m) => m[1]);
    expect(reasons.filter((r) => r === "Retrait -10 %")).toHaveLength(2);
    expect(reasons.filter((r) => r === "Fidélité pain")).toHaveLength(1);
    expect(xml).not.toContain(P1);
    expect(xml).not.toContain("CalculationPercent");
    expect(xml).not.toContain("ReasonCode");
  });

  it("tient BR-CO-11 et BR-S-08", () => {
    expect(facturXArithmeticViolations(xml)).toEqual([]);
  });
});

describe("facture — clé (promotion, taux) sur plusieurs bons", () => {
  it("somme une même promotion sur tous les bons, libellé du bon le plus ancien (Q-M2)", () => {
    const recent = twoDiscountBon("B-RECENT", 9_000, "Retrait (renommé)");
    const old = oneDiscountBon("B-OLD", 1_000, "Retrait d'origine");
    const { vat } = simulateInvoiceDossier([recent, old]).invoice;
    const p1 = vat.categories.flatMap((c) =>
      c.allowances.filter((p) => p.key === `${BASKET_PROMOTION_PREFIX}${P1}`),
    );
    expect(p1.every((p) => p.label === "Retrait d'origine")).toBe(true);
    // Le bon d'une remise garde les parts d'hier (120 c découpés sur 1500 c).
    expect(partAt(vat, `${BASKET_PROMOTION_PREFIX}${P1}`, PAIN)).toBe(100 + 80);
    expect(partAt(vat, `${BASKET_PROMOTION_PREFIX}${P1}`, JUS)).toBe(50 + 40);
    expect(facturXArithmeticViolations(xmlOf([recent, old]))).toEqual([]);
  });

  it("écrit « Remise » pour une promotion sans libellé, jamais son identifiant", () => {
    const xml = xmlOf([twoDiscountBon("B-2", 2_000), oneDiscountBon("B-1", 1_000, null)]);
    expect(xml).toContain("<ram:Reason>Retrait -10 %</ram:Reason>");
    const bare = xmlOf([
      {
        ...twoDiscountBon("B-3", 1_000),
        basketDiscounts: [
          discount(P1, null, [{ rate: PAIN, amountCents: 150 }]),
          discount(null, null, [{ rate: PAIN, amountCents: 45 }]),
        ],
      },
    ]);
    expect(bare).toContain("<ram:Reason>Remise</ram:Reason>");
    expect(bare).toContain("<ram:Reason>Remise client</ram:Reason>");
    expect(bare).not.toContain(P1);
  });
});

describe("facture — des parts qui ne tombent pas juste : le découpage d'hier", () => {
  const reference = frozenBon({ reference: "B-4", lines: lines(), pickupDiscountCents: 195 });

  it.each([
    ["non figées (commande non reprise)", [discount(P1, "a", null), discount(P2, "b", null)]],
    [
      "dont la somme n'est pas la remise du bon",
      [discount(P1, "a", [{ rate: PAIN, amountCents: 100 }]), discount(P2, "b", [])],
    ],
    [
      "qui dépassent la marchandise d'un taux",
      [
        discount(P1, "a", [{ rate: JUS, amountCents: 501 }]),
        discount(P2, "b", [{ rate: PAIN, amountCents: -306 }]),
      ],
    ],
  ])("%s", (_case, basketDiscounts) => {
    const bon: FrozenInvoiceOrder = { ...reference, basketDiscounts };
    expect(simulateInvoiceDossier([bon]).invoice.vat).toEqual(
      simulateInvoiceDossier([reference]).invoice.vat,
    );
  });
});
