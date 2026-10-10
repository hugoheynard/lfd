import type { SyncMedia } from "@lfd/catalog-sync";

import { ProductMediaChangedFact } from "../../../../../pim/channels/b2b-platform/products/product-media-changed.fact.js";
import { CatalogItemRepository } from "../../../domain/ports/catalog-item.repository.js";
import { CatalogItem } from "../../../domain/entities/catalog-item.js";
import { OnProductMediaChangedHandler } from "../on-product-media-changed.handler.js";

const HERO = { url: "https://m.test/hero.jpg", alt: "Ouverture", width: 1800, height: 1200 };
const VIGNETTE = { url: "https://m.test/vig.jpg", alt: "Serré", width: 720, height: 540 };

/** Un dépôt qui garde ce qu'on lui rend, et retient ce qu'on lui a demandé. */
class SpyingItems extends CatalogItemRepository {
  saved: CatalogItem[] = [];
  askedFor: string | null = null;

  constructor(private readonly held: readonly CatalogItem[] = []) {
    super();
  }

  load(): Promise<CatalogItem | null> {
    return Promise.resolve(null);
  }

  loadAll(): Promise<CatalogItem[]> {
    return Promise.resolve([]);
  }

  loadAllIncludingWithdrawn(): Promise<CatalogItem[]> {
    return Promise.resolve([]);
  }

  loadByProduct(productId: string): Promise<CatalogItem[]> {
    this.askedFor = productId;
    return Promise.resolve([...this.held]);
  }

  saveMany(items: readonly CatalogItem[]): Promise<void> {
    this.saved = [...items];
    return Promise.resolve();
  }
}

/** Un article reçu du référentiel, réduit à ce que ce cas regarde. */
function anItem(sku: string): CatalogItem {
  return CatalogItem.receive({
    sku,
    productId: "prd_croissant",
    productSku: "CRO",
    name: "Croissant",
    kind: "daily",
    categoryId: "fam-vien",
    priceMillicents: 140_000,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: 148,
    publicByContext: null,
    allergens: null,
    allergenLabels: null,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    orderTimeLimit: null,
    receivedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
}

/** Livre le fait à l'abonné comme la boîte d'envoi le livre. */
async function run(
  items: SpyingItems,
  productId: string,
  image: SyncMedia | null,
  thumbnail: SyncMedia | null,
): Promise<void> {
  const fact = new ProductMediaChangedFact(productId, "geste_1", image, thumbnail).durableFact();
  await new OnProductMediaChangedHandler(items).handle({
    eventId: "evt_1",
    ...fact,
  });
}

describe("OnProductMediaChanged", () => {
  /**
   * 🔴 Régression attendue du 2026-09-23. `catalog_items.image_url` est une
   * COPIE, écrite par l'ingestion d'un instantané : changer une photo ne se
   * voyait donc en boutique qu'après une republication du catalogue.
   *
   * « Je ne veux pas republier pour les images » (Hugo).
   */
  it("pose les deux visuels sur TOUTES les déclinaisons du produit", async () => {
    // Les visuels sont ceux du PRODUIT : c'est lui qu'on photographie, pas la
    // taille. Les poser sur une seule déclinaison ferait un rayon où la même
    // pièce a deux images selon le format choisi.
    const items = new SpyingItems([anItem("CRO-001"), anItem("CRO-002")]);

    await run(items, "prd_croissant", HERO, VIGNETTE);

    expect(items.askedFor).toBe("prd_croissant");
    expect(items.saved).toHaveLength(2);
    expect(items.saved.map((item) => item.image?.url)).toEqual([HERO.url, HERO.url]);
    expect(items.saved.map((item) => item.thumbnail?.url)).toEqual([VIGNETTE.url, VIGNETTE.url]);
  });

  it("EFFACE le visuel que le référentiel ne porte plus", async () => {
    // Laisser l'ancien ferait vendre sous une photo que la fiche ne désigne
    // plus — et personne ne saurait d'où elle vient.
    const items = new SpyingItems([anItem("CRO-001")]);

    await run(items, "prd_croissant", null, null);

    expect(items.saved[0]?.image).toBeNull();
    expect(items.saved[0]?.thumbnail).toBeNull();
  });

  it("n'écrit RIEN pour un produit que le commerce ne connaît pas", async () => {
    // Le cas NORMAL d'une fiche jamais poussée. Un article naît d'un push, pas
    // d'une projection — en créer un ici ferait entrer en vente une référence
    // sans prix ni TVA.
    const items = new SpyingItems([]);

    await run(items, "prd_inconnu", HERO, null);

    expect(items.saved).toEqual([]);
  });

  /**
   * Inversé le 2026-10-10 (lot E5) : il avalait ses échecs, parce qu'un abonné
   * en mémoire appelé après la transaction ne rejouait rien. Sous la boîte
   * d'envoi, lever fait REJOUER ; avaler marquerait projetée une photo qui ne
   * l'est pas.
   */
  it("LÈVE sur une panne, pour que la boîte d'envoi rejoue", async () => {
    class FailingItems extends SpyingItems {
      override loadByProduct(): Promise<CatalogItem[]> {
        return Promise.reject(new Error("base injoignable"));
      }
    }

    await expect(run(new FailingItems(), "prd_croissant", HERO, VIGNETTE)).rejects.toThrow(
      "base injoignable",
    );
  });

  it("lève sur un fait illisible, sans rien écrire", async () => {
    const items = new SpyingItems([anItem("CRO-001")]);

    await expect(
      new OnProductMediaChangedHandler(items).handle({
        eventId: "evt_2",
        type: "pim.product_media_changed",
        payload: { productId: "prd_croissant" },
      }),
    ).rejects.toThrow("illisible");
    expect(items.saved).toEqual([]);
  });
});
