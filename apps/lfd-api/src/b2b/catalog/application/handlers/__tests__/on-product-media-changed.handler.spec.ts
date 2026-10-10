import type { SyncMedia } from "@lfd/catalog-sync";

import { ProductMediaChangedFact } from "../../../../../pim/channels/b2b-platform/products/product-media-changed.fact.js";
import type { PimImage } from "../../../domain/entities/catalog-item.js";
import { CatalogVisualsProjection } from "../../../domain/ports/catalog-visuals.projection.js";
import { OnProductMediaChangedHandler } from "../on-product-media-changed.handler.js";

const HERO = { url: "https://m.test/hero.jpg", alt: "Ouverture", width: 1800, height: 1200 };
const VIGNETTE = { url: "https://m.test/vig.jpg", alt: "Serré", width: 720, height: 540 };

interface Shown {
  readonly productId: string;
  readonly gestureId: string;
  readonly image: PimImage | null;
  readonly thumbnail: PimImage | null;
}

/** Une projection qui retient ce qu'on lui a demandé. L'ordre se prouve en e2e. */
class SpyingVisuals extends CatalogVisualsProjection {
  shown: Shown[] = [];

  showIfNewer(
    productId: string,
    gestureId: string,
    image: PimImage | null,
    thumbnail: PimImage | null,
  ): Promise<void> {
    this.shown.push({ productId, gestureId, image, thumbnail });
    return Promise.resolve();
  }
}

/** Livre le fait à l'abonné comme la boîte d'envoi le livre. */
async function run(
  visuals: CatalogVisualsProjection,
  image: SyncMedia | null,
  thumbnail: SyncMedia | null,
  gestureId = "geste_1",
): Promise<void> {
  const fact = new ProductMediaChangedFact("prd_croissant", gestureId, image, thumbnail);
  await new OnProductMediaChangedHandler(visuals).handle({
    eventId: "evt_1",
    ...fact.durableFact(),
  });
}

describe("OnProductMediaChanged", () => {
  /**
   * 🔴 Régression du 2026-09-23 : changer une photo ne se voyait en boutique
   * qu'après une republication. « Je ne veux pas republier pour les images ».
   */
  it("projette les deux visuels du produit", async () => {
    const visuals = new SpyingVisuals();

    await run(visuals, HERO, VIGNETTE);

    expect(visuals.shown).toEqual([
      { productId: "prd_croissant", gestureId: "geste_1", image: HERO, thumbnail: VIGNETTE },
    ]);
  });

  /**
   * Défaut du 2026-10-10 (#12) : sans le geste, un fait ancien rejoué après un
   * plus récent remettait l'ancienne image. La projection doit le recevoir.
   */
  it("passe le GESTE du fait, qui ordonne les projections", async () => {
    const visuals = new SpyingVisuals();

    await run(visuals, HERO, null, "0192f3a0-0000-7000-8000-000000000002");

    expect(visuals.shown[0]?.gestureId).toBe("0192f3a0-0000-7000-8000-000000000002");
  });

  it("EFFACE le visuel que le référentiel ne porte plus", async () => {
    const visuals = new SpyingVisuals();

    await run(visuals, null, null);

    expect(visuals.shown[0]).toMatchObject({ image: null, thumbnail: null });
  });

  /**
   * Inversé le 2026-10-10 (lot E5) : sous la boîte d'envoi, lever fait
   * REJOUER ; avaler marquerait projetée une photo qui ne l'est pas.
   */
  it("LÈVE sur une panne, pour que la boîte d'envoi rejoue", async () => {
    class FailingVisuals extends CatalogVisualsProjection {
      showIfNewer(): Promise<void> {
        return Promise.reject(new Error("base injoignable"));
      }
    }

    await expect(run(new FailingVisuals(), HERO, VIGNETTE)).rejects.toThrow("base injoignable");
  });

  it("lève sur un fait illisible, sans rien écrire", async () => {
    const visuals = new SpyingVisuals();

    await expect(
      new OnProductMediaChangedHandler(visuals).handle({
        eventId: "evt_2",
        type: "pim.product_media_changed",
        payload: { productId: "prd_croissant" },
      }),
    ).rejects.toThrow("illisible");
    expect(visuals.shown).toEqual([]);
  });
});
