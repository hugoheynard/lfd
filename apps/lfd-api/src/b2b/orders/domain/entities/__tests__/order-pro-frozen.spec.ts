import { Order } from "../order.js";
import { PRO_BASKETS, proDraftInput } from "./pro-baskets.fixture.js";
import { FROZEN_PRO_DRAFTS } from "./pro-baskets.frozen.js";

/**
 * **Le pro ne change pas d'un centime** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 9, lot C2).
 *
 * Vingt paniers de société passés à `Order.draft`. Chaque montant attendu a été
 * RELEVÉ sur le code d'avant la voie B (2026-10-27), puis écrit ici : la
 * commande d'un particulier se compose désormais en TTC, et rien de ce que
 * traverse une commande pro ne doit avoir bougé. Un rouge ici est une
 * régression du pro, jamais un attendu à « mettre à jour ».
 */
const FROZEN = FROZEN_PRO_DRAFTS;

describe("Order.draft — vingt paniers pro figés (voie B, lot C2)", () => {
  it.each(PRO_BASKETS.map((basket, i) => [basket.name, basket, FROZEN[i]] as const))(
    "%s : mêmes HT, TVA, total et lignes qu'avant",
    (_name, basket, frozen) => {
      const order = Order.draft(proDraftInput(basket));
      order.deferPayment();
      const state = order.toPersistence();

      expect(state.vatMethod).toBe("line_ht");
      expect({
        name: basket.name,
        subtotalCents: state.subtotalCents,
        discountCents: state.discountCents,
        deliveryFeeCents: state.deliveryFeeCents,
        lateFeeCents: state.lateFeeCents,
        vatCents: state.vatCents,
        vatShares: state.vatShares,
        totalCents: state.totalCents,
        lines: state.lines.map((line) => [
          line.lineTotalCents,
          line.unitPriceTtcCents,
          line.lineTotalTtcCents,
        ]),
      }).toEqual(frozen);
      expect(state.discountTtcCents).toBeNull();
      expect(state.voucherTtcCents).toBeNull();
      expect(state.deliveryFeeTtcCents).toBeNull();
    },
  );

  it("couvre bien vingt paniers", () => {
    expect(PRO_BASKETS).toHaveLength(20);
    expect(FROZEN).toHaveLength(20);
  });
});
