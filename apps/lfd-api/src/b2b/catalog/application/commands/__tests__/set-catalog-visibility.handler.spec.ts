import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { SetCatalogVisibilityCommand } from "../set-catalog-visibility.command.js";
import { SetCatalogVisibilityHandler } from "../set-catalog-visibility.handler.js";
import { build, facts, SKU, NAME } from "./catalog-decision-doubles.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(seed?: (item: CatalogItem) => void) {
  const doubles = build(seed);
  return {
    ...doubles,
    visibility: new SetCatalogVisibilityHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("SetCatalogVisibilityHandler", () => {
  it("masquer : le fait part après l'article", async () => {
    const { visibility, events, steps } = setup();

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.hidden"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.hidden",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU },
      },
    ]);
  });

  it("remettre en vente un article masqué journalise « shown »", async () => {
    const { visibility, events } = setup((item) => item.hide("fiche-0"));

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.shown"]);
  });

  it("masquer un article déjà masqué n'écrit aucun fait", async () => {
    const { visibility, events } = setup((item) => item.hide("fiche-0"));

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, true, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("montrer un article visible n'écrit aucun fait", async () => {
    const { visibility, events } = setup();

    await visibility.execute(new SetCatalogVisibilityCommand(SKU, false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });
});
