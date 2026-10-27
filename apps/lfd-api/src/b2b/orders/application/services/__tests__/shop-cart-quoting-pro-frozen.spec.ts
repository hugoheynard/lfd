import { PRO_BASKETS } from "../../../domain/entities/__tests__/pro-baskets.fixture.js";
import { proQuoteOf } from "./pro-quote-baskets.fixture.js";
import { FROZEN_PRO_QUOTES } from "./pro-quote-baskets.frozen.js";

/**
 * **Le devis pro ne change pas d'un centime** — plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 9, lot C2).
 *
 * Les vingt paniers de `Order.draft`, rejoués au devis de la boutique pour une
 * société active. La vue ENTIÈRE a été relevée sur le code d'avant la voie B :
 * lignes, sous-total, remise, port, TVA par taux, total. Un rouge ici est une
 * régression du pro, jamais un attendu à « mettre à jour ».
 */
describe("ShopCartQuoting — vingt devis pro figés (voie B, lot C2)", () => {
  it.each(PRO_BASKETS.map((basket, i) => [basket.name, basket, FROZEN_PRO_QUOTES[i]] as const))(
    "%s : le même devis qu'avant",
    async (name, basket, frozen) => {
      const { quoting, payload } = proQuoteOf(basket);

      const quote = await quoting.quote({ payload, companyId: "co_pro", buyerUserId: "user_pro" });

      expect({ name, ...quote }).toEqual(frozen);
    },
  );

  it("couvre bien vingt paniers", () => {
    expect(FROZEN_PRO_QUOTES).toHaveLength(20);
  });
});
