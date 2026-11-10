import { frozenBon, goodsLine } from "../../domain/services/__tests__/per-order-cycle-fixtures.js";
import type { FrozenInvoiceOrder } from "../../domain/services/invoice-dossier.types.js";
import { warnedOfBasketDiscountFallback } from "../invoice-basket-discount-fallback.warning.js";

/**
 * Un repli de la facture ne passe jamais en silence (plan des promotions,
 * § 18.4, lot M5, consigne du 2026-10-31).
 */

const BON = frozenBon({
  reference: "ORD-77",
  lines: [goodsLine("PAIN", 5.5, 1_000)],
  pickupDiscountCents: 150,
});

function warnings(order: FrozenInvoiceOrder): readonly string[] {
  const seen: string[] = [];
  expect(warnedOfBasketDiscountFallback(order, (message) => seen.push(message))).toBe(order);
  return seen;
}

describe("warnedOfBasketDiscountFallback", () => {
  it("avertit, en nommant la commande et l'écart, quand les parts ne font pas la remise", () => {
    const [message, ...rest] = warnings({
      ...BON,
      basketDiscounts: [
        { promotionId: "p1", label: "a", parts: [{ rate: 5.5, amountCents: 100 }] },
        { promotionId: "p2", label: "b", parts: [{ rate: 5.5, amountCents: 20 }] },
      ],
    });
    expect(rest).toEqual([]);
    expect(message).toContain("ORD-77");
    expect(message).toContain("parts de 120 c pour une remise de 150 c");
  });

  it("avertit quand les parts ne sont pas figées", () => {
    const [message] = warnings({
      ...BON,
      basketDiscounts: [
        { promotionId: "p1", label: "a", parts: null },
        { promotionId: "p2", label: "b", parts: null },
      ],
    });
    expect(message).toContain("parts non figées");
  });

  it("se tait pour des parts justes, une seule remise, ou aucune", () => {
    expect(
      warnings({
        ...BON,
        basketDiscounts: [
          { promotionId: "p1", label: "a", parts: [{ rate: 5.5, amountCents: 100 }] },
          { promotionId: "p2", label: "b", parts: [{ rate: 5.5, amountCents: 50 }] },
        ],
      }),
    ).toEqual([]);
    expect(
      warnings({ ...BON, basketDiscounts: [{ promotionId: "p1", label: null, parts: null }] }),
    ).toEqual([]);
    expect(warnings(BON)).toEqual([]);
  });
});
