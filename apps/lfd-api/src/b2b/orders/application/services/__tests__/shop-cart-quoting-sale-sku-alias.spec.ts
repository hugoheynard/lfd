import { UnknownSkuError } from "../../../../catalog/domain/errors/unknown-sku.error.js";
import {
  intakeOver,
  RecordingAliasResolutions,
} from "../../../../catalog/application/__tests__/sale-reference-intake.doubles.js";
import { catalogItem, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis de la boutique devant une ancienne référence**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5) : un
 * panier gardé sous `P-X` se chiffre sous l'article que la table désigne, et
 * le devis rend cette référence-là — c'est elle que la boutique garde ensuite.
 */

const TARGET = catalogItem("P-X-1", "Pain de campagne", 300_000, 5.5);
const VISITOR = { companyId: null, buyerUserId: null } as const;

describe("ShopCartQuoting — l'alias à l'entrée", () => {
  it("chiffre une ancienne référence sous sa cible, et la rend normalisée", async () => {
    const resolutions = new RecordingAliasResolutions();
    const quoting = quotingOf({
      catalog: [TARGET],
      intake: intakeOver([{ aliasSku: "P-X", targetSku: "P-X-1" }], resolutions),
    });

    const { view } = await quoting.quote({
      ...VISITOR,
      payload: {
        lines: [
          { sku: "P-X", quantity: 2 },
          { sku: "P-X-1", quantity: 1 },
        ],
        fulfillment: null,
      },
    });

    expect(view.lines).toEqual([expect.objectContaining({ sku: "P-X-1", quantity: 3 })]);
    expect(resolutions.recorded).toEqual([
      { entry: "shop_quote", resolved: [{ aliasSku: "P-X", targetSku: "P-X-1" }] },
    ]);
  });

  it("sans alias, une référence absente du catalogue est refusée comme aujourd'hui", async () => {
    const quoting = quotingOf({ catalog: [TARGET] });

    await expect(
      quoting.quote({
        ...VISITOR,
        payload: { lines: [{ sku: "P-X", quantity: 1 }], fulfillment: null },
      }),
    ).rejects.toThrow(UnknownSkuError);
  });
});
