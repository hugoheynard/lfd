import { optionsBySku } from "../worksheet-line-options.js";

/** « 4 pains de campagne, dont 2 tranchés » sur la fiche (`plan-options-de-commande.md`, § 3.4). */
describe("optionsBySku — les options d'un article, toutes commandes confondues", () => {
  it("additionne un même choix sur plusieurs commandes, et laisse les autres articles absents", () => {
    const options = optionsBySku([
      {
        lines: [
          {
            sku: "PAIN",
            options: [{ groupName: "Tranchage", choiceLabel: "tranché", quantity: 2 }],
          },
          { sku: "BAG" },
        ],
      },
      {
        lines: [
          {
            sku: "PAIN",
            options: [
              { groupName: "Tranchage", choiceLabel: "tranché", quantity: 1 },
              { groupName: "Emballage", choiceLabel: "emballé", quantity: 3 },
            ],
          },
        ],
      },
    ]);

    expect(options.get("PAIN")).toEqual([
      { groupName: "Tranchage", choiceLabel: "tranché", quantity: 3 },
      { groupName: "Emballage", choiceLabel: "emballé", quantity: 3 },
    ]);
    expect(options.has("BAG")).toBe(false);
  });

  it("aucune option : une table vide", () => {
    expect(optionsBySku([{ lines: [{ sku: "PAIN", options: [] }] }]).size).toBe(0);
  });
});
