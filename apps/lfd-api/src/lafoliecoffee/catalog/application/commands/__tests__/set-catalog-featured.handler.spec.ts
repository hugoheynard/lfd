import type { CatalogItem } from "../../../domain/entities/catalog-item.js";
import {
  CannotFeatureHiddenItemError,
  FeaturingOutsideAudienceError,
} from "../../../domain/errors/catalog-errors.js";
import { SetCatalogFeaturedCommand } from "../set-catalog-featured.command.js";
import { SetCatalogFeaturedHandler } from "../set-catalog-featured.handler.js";
import { build, facts, SKU, NAME } from "./catalog-decision-doubles.js";

/** Le handler sous test, branché sur les doubles de `build`. */
function setup(...args: Parameters<typeof build>) {
  const doubles = build(...args);
  return {
    ...doubles,
    featured: new SetCatalogFeaturedHandler(doubles.items, doubles.events, doubles.uow),
  };
}

describe("SetCatalogFeaturedHandler", () => {
  it("mettre en avant chez les pros : le fait pro part après l'article", async () => {
    const { featured, events, steps } = setup();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, "pro", true, "fiche-1"));

    expect(steps).toEqual([`save:${SKU}`, "journal:catalog_item.featured_pro"]);
    expect(facts(events)).toEqual([
      {
        type: "catalog_item.featured_pro",
        subjectType: "catalog_item",
        subjectId: SKU,
        payload: { subjectLabel: NAME, sku: SKU },
      },
    ]);
  });

  it("mettre en avant au public journalise le fait public", async () => {
    const { featured, events } = setup();

    await featured.execute(new SetCatalogFeaturedCommand(SKU, "public", true, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.featured_public"]);
  });

  it("retirer la mise en avant pro journalise « unfeatured_pro »", async () => {
    const { featured, events } = setup((item) => item.feature("pro", "fiche-0"));

    await featured.execute(new SetCatalogFeaturedCommand(SKU, "pro", false, "fiche-1"));

    expect(events.factTypes()).toEqual(["catalog_item.unfeatured_pro"]);
  });

  it("retirer la mise en avant publique d'un article mis en avant chez les pros seulement n'écrit rien", async () => {
    const { featured, events } = setup((item) => item.feature("pro", "fiche-0"));

    await featured.execute(new SetCatalogFeaturedCommand(SKU, "public", false, "fiche-1"));

    expect(events.traced).toHaveLength(0);
  });

  it("mettre en avant un article masqué pour cette audience est refusé, sans fait", async () => {
    const { featured, events } = setup((item: CatalogItem) => item.hide("fiche-0"));

    await expect(
      featured.execute(new SetCatalogFeaturedCommand(SKU, "pro", true, "fiche-1")),
    ).rejects.toBeInstanceOf(CannotFeatureHiddenItemError);
    expect(events.traced).toHaveLength(0);
  });

  it("mettre en avant pour une audience que l'article ne sert pas est refusé, sans écriture", async () => {
    const { featured, events, steps } = setup(undefined, {
      audience: "pro",
      publicReviewPending: false,
      proReviewPending: false,
    });

    await expect(
      featured.execute(new SetCatalogFeaturedCommand(SKU, "public", true, "fiche-1")),
    ).rejects.toBeInstanceOf(FeaturingOutsideAudienceError);
    expect(steps).toEqual([]);
    expect(events.traced).toHaveLength(0);
  });
});
