import {
  PlatformHasNoEquipmentError,
  PointOfSaleLabelRequiredError,
} from "../../errors/points-of-sale-errors.js";
import { PointOfSale } from "../point-of-sale.js";

function openShop(over: Partial<Parameters<typeof PointOfSale.openShop>[0]> = {}): PointOfSale {
  return PointOfSale.openShop({
    id: "pos_1",
    label: "Village",
    baseUrl: " https://order.example ",
    contexts: ["takeaway", "eatIn"],
    tableCount: 3,
    ...over,
  });
}

function platform(): PointOfSale {
  return PointOfSale.reconstitute({
    id: "pos_b2b",
    kind: "platform",
    label: "B2B",
    baseUrl: null,
    contexts: ["b2b"],
    tables: [],
  });
}

describe("l'agrégat PointOfSale", () => {
  it("exige un libellé, et trime l'adresse", () => {
    expect(() => openShop({ label: "   " })).toThrow(PointOfSaleLabelRequiredError);
    expect(openShop().snapshot().baseUrl).toBe("https://order.example");
  });

  it("dédoublonne et ordonne l'offre", () => {
    // L'ordre n'a pas de sens métier ; il en a pour la COMPARAISON du journal,
    // qui inscrirait sinon un « changement » que personne n'a fait.
    const shop = openShop({ contexts: ["takeaway", "eatIn", "takeaway"] });

    expect(shop.snapshot().contexts).toEqual(["eatIn", "takeaway"]);
  });

  /**
   * ⚠️ **L'invariant précédent est tombé, délibérément** (p-3). Fermer la salle
   * vidait la grille : `eatIn` faisait deux métiers — « ce lieu sert en salle »
   * et « ce lieu a des QR ». Une grille de tables est de l'ÉQUIPEMENT ; deux
   * boulangeries peuvent toutes deux servir en salle et une seule être équipée.
   */
  it("GARDE la grille quand on cesse d'offrir le sur place", () => {
    const shop = openShop();
    shop.attachQr(2, "tok_2");

    shop.setOfferedContexts(["takeaway"]);

    const snapshot = shop.snapshot();
    expect(snapshot.contexts).toEqual(["takeaway"]);
    expect(snapshot.tables).toHaveLength(3);
    expect(snapshot.tables.find((table) => table.number === 2)?.token).toBe("tok_2");
  });

  it("préserve l'état QR des tables conservées quand la grille rétrécit", () => {
    // Le numéro EST l'identité de l'URL imprimée : régénérer un token pour une
    // table qui n'a pas bougé invaliderait un QR encore collé dessus.
    const shop = openShop({ tableCount: 3 });
    shop.attachQr(2, "tok_2");

    shop.setTableCount(2);

    const tables = shop.snapshot().tables;
    expect(tables.map((table) => table.number)).toEqual([1, 2]);
    expect(tables.find((table) => table.number === 2)?.token).toBe("tok_2");
  });

  it("rend faux plutôt que de lever quand la table n'existe pas", () => {
    // Le domaine ne connaît pas les codes HTTP : le handler traduit ce « non ».
    expect(openShop({ tableCount: 1 }).attachQr(9, "tok")).toBe(false);
  });

  describe("le genre interdit l'équipement d'une plateforme", () => {
    it("refuse une URL de click & collect", () => {
      expect(() => platform().setBaseUrl("https://…")).toThrow(PlatformHasNoEquipmentError);
    });

    it("refuse une grille de tables", () => {
      expect(() => platform().setTableCount(4)).toThrow(PlatformHasNoEquipmentError);
    });

    it("laisse en revanche régler son offre", () => {
      const b2b = platform();

      b2b.setOfferedContexts(["b2b", "takeaway"]);

      expect(b2b.snapshot().contexts).toEqual(["b2b", "takeaway"]);
    });
  });
});
