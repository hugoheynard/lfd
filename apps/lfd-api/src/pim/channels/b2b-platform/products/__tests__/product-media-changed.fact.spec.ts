import {
  PIM_PRODUCT_MEDIA_CHANGED,
  ProductMediaChangedFact,
  ProductMediaChangedPayloadError,
} from "../product-media-changed.fact.js";

const HERO = {
  url: "https://media.example/hero.jpg",
  alt: "Croissant",
  width: 1200,
  height: 800,
  focal: { x: 0.25, y: 0.75 },
};

/**
 * Lot E5 (2026-10-10) : la projection des visuels relit ce fait dans la boîte
 * d'envoi. Un payload hors forme est une faute d'émetteur — le relire en
 * devinant un visuel écrirait une photo que la fiche ne désigne pas.
 */
describe("ProductMediaChangedFact — le fait durable", () => {
  it("porte une clé par geste, et se relit à l'identique", () => {
    const fact = new ProductMediaChangedFact("prd_1", "g_1", HERO, null).durableFact();

    expect(fact).toEqual({
      type: PIM_PRODUCT_MEDIA_CHANGED,
      key: "pim.product_media_changed:prd_1:g_1",
      payload: { productId: "prd_1", gestureId: "g_1", image: HERO, thumbnail: null },
    });
    expect(ProductMediaChangedFact.fromPayload(fact.payload)).toEqual(
      new ProductMediaChangedFact("prd_1", "g_1", HERO, null),
    );
  });

  it.each([
    [{ gestureId: "g_1", image: null, thumbnail: null }],
    [{ productId: "prd_1", image: null, thumbnail: null }],
    [{ productId: "prd_1", gestureId: "g_1", thumbnail: null }],
    [{ productId: "prd_1", gestureId: "g_1", image: "hero.jpg", thumbnail: null }],
    [{ productId: "prd_1", gestureId: "g_1", image: { ...HERO, url: "" }, thumbnail: null }],
    [{ productId: "prd_1", gestureId: "g_1", image: { ...HERO, width: 0 }, thumbnail: null }],
    [{ productId: "prd_1", gestureId: "g_1", image: null, thumbnail: { url: "x" } }],
    [
      {
        productId: "prd_1",
        gestureId: "g_1",
        image: { ...HERO, focal: { x: 1.5, y: 0.5 } },
        thumbnail: null,
      },
    ],
  ])("refuse un payload hors forme %o", (payload) => {
    expect(() => ProductMediaChangedFact.fromPayload(payload)).toThrow(
      ProductMediaChangedPayloadError,
    );
  });

  /**
   * L4 (2026-10-10) : un fait écrit AVANT que le point focal ne voyage peut
   * dormir dans la boîte d'envoi. Le refuser ferait d'un ajout de champ une
   * panne de projection ; il se lit « centre ».
   */
  it("relit un fait d'avant le point focal, et le lit « personne ne s'est prononcé »", () => {
    const older = { url: HERO.url, alt: HERO.alt, width: HERO.width, height: HERO.height };

    const fact = ProductMediaChangedFact.fromPayload({
      productId: "prd_1",
      gestureId: "g_1",
      image: older,
      thumbnail: older,
    });

    expect(fact.image).toEqual({ ...older, focal: null });
    expect(fact.thumbnail?.focal).toBeNull();
  });
});
