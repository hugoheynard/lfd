import { particularBackorderQuoteEntryOf } from "../particular-backorder-entry.js";
import { openBackorder } from "./backorder-conversion-doubles.js";

/**
 * Régression : la saisie du reliquat d'un particulier reconstruisait ses
 * lignes sans les options de l'origine — « dont 2 tranchés » se perdait en
 * silence (`plan-options-de-commande.md`, § 3.4).
 */
/** Le corps de l'écran ; aucune date comparée à l'horloge ici. */
const BODY = {
  venue: "shop_till" as const,
  fulfillmentMethod: "pickup" as const,
  deliveryAddress: null,
  deliveryAddressId: null,
  pickupAddressId: "pickup_1",
  requestedDeliveryDate: "2026-09-01",
  requestedWindow: { start: "07:00", end: "08:00" },
  note: "",
};

describe("particularBackorderQuoteEntryOf — les options de l'origine", () => {
  const SLICED = {
    group: "tranchage",
    groupName: "Tranchage",
    choice: "tranche",
    choiceLabel: "tranché",
    quantity: 2,
    position: 0,
  };

  it("recopie les options d'origine, plafonnées à ce qui reste", () => {
    const entry = particularBackorderQuoteEntryOf(
      openBackorder({ companyId: null, quantity: 1 }),
      BODY,
      [{ sku: "PAI-001", saleUnit: "piece", optionChoices: [SLICED] }],
    );

    expect(entry.payload.lines).toEqual([
      {
        sku: "PAI-001",
        quantity: 1,
        saleUnit: "piece",
        optionChoices: [{ group: "tranchage", choice: "tranche", quantity: 1 }],
      },
    ]);
  });

  it("une origine sans option : la ligne n'écrit pas le champ", () => {
    const entry = particularBackorderQuoteEntryOf(
      openBackorder({ companyId: null, quantity: 1 }),
      BODY,
      [{ sku: "PAI-001", saleUnit: "piece", optionChoices: [] }],
    );

    expect(entry.payload.lines).toEqual([{ sku: "PAI-001", quantity: 1, saleUnit: "piece" }]);
  });
});
