import type { ShopImageView } from "@lfd/contracts";

import { catalogue, item } from "../../__tests__/vitrine-fixtures.js";
import { VitrineContents } from "../../vitrine-contents.js";
import { altOf, euroText, focaleOf, vitrineItemOf } from "../vitrine-item.js";
import { vitrineCatalogueOf } from "../vitrine-view.js";

const SHELVES = new Map([["viennoiseries", "Viennoiseries"]]);

function image(overrides: Partial<ShopImageView> = {}): ShopImageView {
  return {
    url: "https://media.example/croissant.jpg",
    alt: "Croissant doré",
    width: 800,
    height: 600,
    ...overrides,
  };
}

describe("les prix de l'agence, en euros à la française", () => {
  it("écrit une virgule et toujours deux décimales", () => {
    expect(euroText(1300)).toBe("13,00");
    expect(euroText(1232)).toBe("12,32");
    expect(euroText(5)).toBe("0,05");
    expect(euroText(0)).toBe("0,00");
  });

  it("dérive le TTC des centimes servis, sans recalcul", () => {
    const view = vitrineItemOf(item("CRO-01", { unitPriceTtcCents: 1300 }), SHELVES);
    expect(view.unitPriceTTC).toBe("13,00");
  });

  it("arrondit le HT au centime le plus proche, la moitié vers le haut", () => {
    const at = (unitPriceMillicents: number): string =>
      vitrineItemOf(item("CRO-01", { unitPriceMillicents }), SHELVES).unitPriceHT;
    expect(at(1_231_818)).toBe("12,32");
    expect(at(1_231_499)).toBe("12,31");
    expect(at(1_231_500)).toBe("12,32");
    expect(at(1_200_000)).toBe("12,00");
  });
});

describe("le rayon de l'agence", () => {
  it("nomme le rayon de l'article, depuis les rayons de la vue", () => {
    expect(vitrineItemOf(item("CRO-01"), SHELVES).shelfName).toBe("Viennoiseries");
  });

  it("rend un nom vide plutôt qu'un nom inventé pour un rayon absent", () => {
    expect(vitrineItemOf(item("CRO-01", { shelfId: "inconnu" }), SHELVES).shelfName).toBe("");
  });

  it("le lit dans la vue de l'abonné, dans la langue servie", () => {
    const view = vitrineCatalogueOf(
      catalogue({ shelves: [{ id: "viennoiseries", name: "Pastries", position: 1 }] }),
      VitrineContents.of(["catalogue"]),
      "en",
    );
    expect(view.items.map((entry) => entry.shelfName)).toEqual(["Pastries", "Pastries"]);
  });
});

describe("la focale de la vignette", () => {
  it("écrit le point focal en « x,y » à deux décimales", () => {
    expect(focaleOf(image({ focal: { x: 0.5, y: 0.3 } }))).toBe("0.50,0.30");
    expect(focaleOf(image({ focal: { x: 0.125, y: 1 } }))).toBe("0.13,1.00");
  });

  it("est vide sans point focal, absent ou null", () => {
    expect(focaleOf(image())).toBe("");
    expect(focaleOf(image({ focal: null }))).toBe("");
  });

  it("ne sort que dans la vignette, l'image principale garde sa forme", () => {
    const view = vitrineItemOf(
      item("CRO-01", { image: image(), thumbnail: image({ focal: { x: 0.5, y: 0.3 } }) }),
      SHELVES,
    );
    expect(view.thumbnail?.focale).toBe("0.50,0.30");
    expect(view.thumbnail?.focal).toEqual({ x: 0.5, y: 0.3 });
    expect(view.image).not.toHaveProperty("focale");
  });
});

describe("le texte alternatif", () => {
  it("garde celui que la médiathèque a écrit", () => {
    expect(altOf(image(), "Croissant")).toBe("Croissant doré");
  });

  /**
   * Régression : la médiathèque replie une alternative absente sur l'URL de
   * l'image, et l'agence recevait cette URL dans `<alt>` (relevé le 2026-10-23).
   */
  it("remplace une URL servie comme alternative par le nom de l'article", () => {
    const leaked = image({ alt: "https://media.example/croissant.jpg" });
    expect(altOf(leaked, "Croissant au beurre")).toBe("Croissant au beurre");
    const view = vitrineItemOf(
      item("CRO-01", { name: "Croissant au beurre", image: leaked, thumbnail: leaked }),
      SHELVES,
    );
    expect(view.image?.alt).toBe("Croissant au beurre");
    expect(view.thumbnail?.alt).toBe("Croissant au beurre");
  });

  it("remplace une alternative vide par le nom de l'article", () => {
    expect(altOf(image({ alt: "  " }), "Pain")).toBe("Pain");
  });
});
