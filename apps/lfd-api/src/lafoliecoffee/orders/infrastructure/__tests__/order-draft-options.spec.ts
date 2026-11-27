import { orderDraftPayloadSchema } from "@lfd/contracts";

/**
 * Le brouillon de la saisie garde les options d'une ligne (« dont 2
 * tranchés », `plan-options-de-commande.md`, § 3.3) : le dépôt range le corps
 * tel que le schéma le relit, et une option acceptée à l'écriture ne doit pas
 * s'évaporer à la relecture.
 */
describe("orderDraftPayloadSchema — les options d'une ligne", () => {
  it("relit les options telles qu'elles ont été enregistrées", () => {
    const line = {
      sku: "PAIN",
      quantity: 4,
      optionChoices: [{ group: "tranchage", choice: "tranche", quantity: 2 }],
    };

    const stored = orderDraftPayloadSchema.parse({ lines: [line] });
    const reread = orderDraftPayloadSchema.parse(JSON.parse(JSON.stringify(stored)));

    expect(reread.lines[0]?.optionChoices).toEqual(line.optionChoices);
  });
});
