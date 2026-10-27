import { updateVariantPricingPayloadSchema } from "../product.js";

/**
 * ⚠️ Ce fichier a porté les tests de `htFromTtc` / `htMillicentsOf` jusqu'au
 * 2026-09-21 (partis avec leur code dans `@lfd/money`), puis ceux de
 * `proHtFromPublic` jusqu'au 2026-10-27 (partis avec le rapport pro, lot R3 de
 * `plan-retirer-le-rapport-pro.md`). Reste le schéma qui saisit le prix.
 */

/**
 * **La porte d'entrée, fermée.** Un seul système est valide : le prix se saisit
 * TTC, le hors taxe se dérive.
 *
 * Le champ `priceBasis` a disparu du contrat, et ce cas est là pour que sa
 * disparition soit un FAIT testé plutôt qu'une absence. Un jour quelqu'un
 * voudra rouvrir la porte ; il tombera d'abord ici.
 */
describe("updateVariantPricingPayloadSchema — une seule assiette", () => {
  it("n'attend plus qu'un prix et un poids : le prix EST un prix public TTC", () => {
    expect(
      updateVariantPricingPayloadSchema.parse({ priceCents: 1_000, weightGrams: null }),
    ).toEqual({ priceCents: 1_000, weightGrams: null });
  });
});
