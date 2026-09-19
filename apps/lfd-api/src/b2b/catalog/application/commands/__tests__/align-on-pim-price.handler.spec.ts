import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { AlignOnPimPriceCommand } from "../align-on-pim-price.command.js";
import { AlignOnPimPriceHandler } from "../align-on-pim-price.handler.js";
import { build, facts, NEGOTIATED, SKU, NAME } from "./catalog-decision-doubles.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(seed?: (item: CatalogItem) => void) {
  const doubles = build(seed);
  return {
    ...doubles,
    align: new AlignOnPimPriceHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("AlignOnPimPriceHandler", () => {
  it("journalise le retour au PIM avec le prix B2B retiré", async () => {
    const { align, events, steps, items } = setup((item) => item.setB2bPrice(NEGOTIATED, "f"));

    await align.execute(new AlignOnPimPriceCommand(SKU));

    expect(items.current(SKU)?.b2bPriceMillicents).toBeNull();
    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.b2b_price_cleared"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.b2b_price_cleared",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU, before: { priceMillicents: NEGOTIATED } },
      },
    ]);
  });

  /** Un fait « revenu au PIM » sur un article qui le suivait mentirait au lecteur. */
  it("aligner un article qui suit déjà le PIM n'écrit aucun fait", async () => {
    const { align, events } = setup();

    await expect(align.execute(new AlignOnPimPriceCommand(SKU))).resolves.toBeUndefined();

    expect(events.traced).toHaveLength(0);
  });
});
