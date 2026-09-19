import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { RedundantB2bPriceError } from "../../../domain/errors/catalog-errors.js";
import { CatalogItemNotFoundError } from "../../../domain/errors/catalog-not-found.error.js";
import { SetB2bPriceCommand } from "../set-b2b-price.command.js";
import { SetB2bPriceHandler } from "../set-b2b-price.handler.js";
import { build, facts, NEGOTIATED, PIM_PRICE, SKU, NAME } from "./catalog-decision-doubles.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(seed?: (item: CatalogItem) => void) {
  const doubles = build(seed);
  return {
    ...doubles,
    setPrice: new SetB2bPriceHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("SetB2bPriceHandler", () => {
  it("journalise une première pose : pas d'avant, l'après en millicentimes", async () => {
    const { setPrice, events, steps } = setup();

    await setPrice.execute(new SetB2bPriceCommand(SKU, NEGOTIATED, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.b2b_price_set"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.b2b_price_set",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: {
          subjectLabel: NAME,
          sku: SKU,
          before: null,
          after: { priceMillicents: NEGOTIATED },
        },
      },
    ]);
  });

  it("garde le prix remplacé dans l'avant", async () => {
    const { setPrice, events } = setup((item) => item.setB2bPrice(NEGOTIATED, "fiche-0"));

    await setPrice.execute(new SetB2bPriceCommand(SKU, 180_000, "fiche-1"));

    expect(facts(events)[0]?.payload).toEqual({
      subjectLabel: NAME,
      sku: SKU,
      before: { priceMillicents: NEGOTIATED },
      after: { priceMillicents: 180_000 },
    });
  });

  it("reposer le même prix n'écrit aucun fait", async () => {
    const { setPrice, events } = setup((item) => item.setB2bPrice(NEGOTIATED, "fiche-0"));

    await setPrice.execute(new SetB2bPriceCommand(SKU, NEGOTIATED, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("un refus de l'agrégat n'écrit ni l'article ni le fait", async () => {
    const { setPrice, events, steps } = setup();

    await expect(
      setPrice.execute(new SetB2bPriceCommand(SKU, PIM_PRICE, "fiche-1")),
    ).rejects.toBeInstanceOf(RedundantB2bPriceError);
    expect(steps).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });

  it("un article disparu n'écrit aucun fait", async () => {
    const { setPrice, events } = setup();

    await expect(
      setPrice.execute(new SetB2bPriceCommand("INCONNU-1", NEGOTIATED, "fiche-1")),
    ).rejects.toBeInstanceOf(CatalogItemNotFoundError);
    expect(events.traced).toHaveLength(0);
  });
});
