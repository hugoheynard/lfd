import { madeToOrderLinesFrom } from "../made-to-order-lines.sql.js";
import { revenueWhere } from "../revenue.where.js";

/**
 * Le CA web ne compte que ce qui se règle chez nous : une commande à régler à
 * la caisse de la boutique en est exclue
 * (`commande-particulier-reglee-en-boutique.md`, § 4.2).
 */
describe("le périmètre du chiffre d'affaires web", () => {
  it("le `where` Prisma ne retient que les commandes sans lieu de règlement extérieur", () => {
    expect(revenueWhere()).toMatchObject({ settlementVenue: null });
  });

  it("le SQL du sur mesure lit la même condition", () => {
    expect(madeToOrderLinesFrom("2026-11-01", "2026-11-30").sql).toContain(
      `"o"."settlement_venue" IS NULL`,
    );
  });
});
