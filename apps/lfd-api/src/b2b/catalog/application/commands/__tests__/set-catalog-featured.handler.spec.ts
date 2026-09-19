import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { CannotFeatureHiddenItemError } from "../../../domain/errors/catalog-errors.js";
import { SetCatalogFeaturedCommand } from "../set-catalog-featured.command.js";
import { SetCatalogFeaturedHandler } from "../set-catalog-featured.handler.js";
import { build, facts, SKU, NAME } from "./catalog-decision-doubles.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(seed?: (item: CatalogItem) => void) {
  const doubles = build(seed);
  return {
    ...doubles,
    featured: new SetCatalogFeaturedHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("SetCatalogFeaturedHandler", () => {
  it("mettre en avant : le fait part après l'article", async () => {
    const { featured, events, steps } = setup();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.featured"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.featured",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU },
      },
    ]);
  });

  it("retirer la mise en avant journalise « unfeatured »", async () => {
    const { featured, events } = setup((item) => item.feature("fiche-0"));

    await featured.execute(new SetCatalogFeaturedCommand(SKU, false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.unfeatured"]);
  });

  it("retirer une mise en avant absente n'écrit aucun fait", async () => {
    const { featured, events } = setup();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("mettre en avant un article masqué est refusé, sans fait", async () => {
    const { featured, events } = setup((item) => item.hide("fiche-0"));

    await expect(
      featured.execute(new SetCatalogFeaturedCommand(SKU, true, "fiche-1")),
    ).rejects.toBeInstanceOf(CannotFeatureHiddenItemError);
    expect(events.traced).toHaveLength(0);
  });
});
