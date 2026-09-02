import {
  CannotFeatureHiddenItemError,
  InvalidB2bPriceError,
  RedundantB2bPriceError,
} from "../../errors/catalog-errors.js";
import { CatalogItem, type PimFacts } from "../catalog-item.js";

/**
 * L'agrégat, éprouvé **sans Nest et sans base** : on instancie, on appelle une
 * méthode métier, on assert — y compris les refus.
 */

function facts(over: Partial<PimFacts> = {}): PimFacts {
  return {
    sku: "VIE-001-1",
    allergens: null,
    allergenLabels: null,
    productId: "prd_1",
    productSku: "VIE-001",
    name: "Croissant",
    kind: "daily",
    categoryId: "cat_vien",
    priceMillicents: 200,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    receivedAt: new Date("2026-08-17T08:00:00.000Z"),
    ...over,
  };
}

describe("CatalogItem — le prix", () => {
  it("part au tarif du PIM tant que personne n'a rien décidé", () => {
    const item = CatalogItem.receive(facts());

    expect(item.effectivePriceMillicents).toBe(200);
    expect(item.toPersistence().decision).toBeNull();
  });

  it("la décision locale gagne une fois posée", () => {
    const item = CatalogItem.receive(facts());

    item.setB2bPrice(180, "cecile");

    expect(item.effectivePriceMillicents).toBe(180);
    expect(item.pimPriceMillicents).toBe(200);
  });

  it("refuse un prix nul ou négatif — on ne vend ni à perte ni gratuitement", () => {
    const item = CatalogItem.receive(facts());

    expect(() => item.setB2bPrice(0, null)).toThrow(InvalidB2bPriceError);
    expect(() => item.setB2bPrice(-50, null)).toThrow(InvalidB2bPriceError);
  });

  it("refuse un prix à virgule — l'argent est en centimes entiers", () => {
    const item = CatalogItem.receive(facts());

    expect(() => item.setB2bPrice(180.5, null)).toThrow(InvalidB2bPriceError);
  });

  /**
   * Recopier le prix du PIM créerait une ligne fantôme : l'écran annoncerait une
   * négociation inexistante, et le jour où le PIM change son tarif, cette ligne
   * empêcherait le nouveau prix de passer sans que personne ne comprenne.
   */
  it("refuse un prix identique à celui du PIM, et nomme le geste correct", () => {
    const item = CatalogItem.receive(facts());

    expect(() => item.setB2bPrice(200, "cecile")).toThrow(RedundantB2bPriceError);
  });

  it("s'aligner sur le PIM efface la décision, pas la remplace par une valeur", () => {
    const item = CatalogItem.receive(facts());
    item.setB2bPrice(180, "cecile");

    item.alignOnPim();

    expect(item.effectivePriceMillicents).toBe(200);
    expect(item.toPersistence().decision).toBeNull();
  });
});

describe("CatalogItem — la visibilité", () => {
  it("masquer retire l'article de la vitrine", () => {
    const item = CatalogItem.receive(facts());

    item.hide("cecile");

    expect(item.isHidden).toBe(true);
  });

  it("masquer éteint la mise en avant — les deux ensemble se contrediraient", () => {
    const item = CatalogItem.receive(facts());
    item.feature("cecile");

    item.hide("cecile");

    expect(item.isFeatured).toBe(false);
  });

  /**
   * L'inverse est ambigu, donc refusé : sans ça, un commercial croirait avoir
   * mis en vitrine un produit que personne ne voit.
   */
  it("refuse de mettre en avant un article masqué", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    expect(() => item.feature("cecile")).toThrow(CannotFeatureHiddenItemError);
  });

  it("réafficher puis mettre en avant fonctionne", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    item.show("cecile");
    item.feature("cecile");

    expect(item.isFeatured).toBe(true);
  });
});

describe("CatalogItem — le push", () => {
  /**
   * L'invariant central du chantier. Il n'est pas surveillé : `refreshFromPim`
   * n'écrit que les faits, donc perdre la décision n'est pas exprimable.
   */
  it("rafraîchir depuis le PIM garde la décision locale", () => {
    const item = CatalogItem.receive(facts());
    item.setB2bPrice(180, "cecile");

    const refreshed = item.refreshFromPim(
      facts({ priceMillicents: 220, name: "Croissant beurre" }),
    );

    expect(refreshed.pimPriceMillicents).toBe(220);
    expect(refreshed.effectivePriceMillicents).toBe(180);
    expect(refreshed.toPersistence().decision?.decidedBy).toBe("cecile");
  });

  it("rafraîchir garde aussi la visibilité", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    const refreshed = item.refreshFromPim(facts({ priceMillicents: 220 }));

    expect(refreshed.isHidden).toBe(true);
  });

  it("un article sans décision reste sans décision après un push", () => {
    const item = CatalogItem.receive(facts());

    const refreshed = item.refreshFromPim(facts({ priceMillicents: 220 }));

    expect(refreshed.toPersistence().decision).toBeNull();
  });
});

/**
 * Le retrait était une SUPPRESSION, et la décision commerciale partait en
 * cascade. Le raisonnement était juste tant que le retrait était définitif ;
 * c'est le retour arrière qui l'a périmé, pas une erreur de jugement.
 */
describe("CatalogItem — le retrait", () => {
  const SORTIE = new Date("2026-03-01T09:00:00.000Z");

  it("marque la sortie sans toucher à ce qui a été décidé", () => {
    const item = CatalogItem.receive(facts());
    item.setB2bPrice(180_000, "cecile");

    item.withdraw(SORTIE);

    expect(item.isWithdrawn).toBe(true);
    expect(item.toPersistence()).toMatchObject({
      withdrawnAt: SORTIE,
      decision: { priceMillicents: 180_000, decidedBy: "cecile" },
    });
  });

  /**
   * C'est la PREMIÈRE sortie qui répond à « depuis quand ». Un second push qui
   * ignore encore l'article ne doit pas effacer cette réponse.
   */
  it("ne redate pas un retrait déjà posé", () => {
    const item = CatalogItem.receive(facts());
    item.withdraw(SORTIE);

    item.withdraw(new Date("2026-04-01T09:00:00.000Z"));

    expect(item.toPersistence().withdrawnAt).toEqual(SORTIE);
  });

  /**
   * 🔴 Le référentiel envoie l'article : il est au catalogue, point. C'est ce qui
   * rend le retrait réversible — et le prix négocié le retrouve, puisque la
   * décision traverse `refreshFromPim`.
   */
  it("un push qui rapporte l'article le remet en vente, décision comprise", () => {
    const item = CatalogItem.receive(facts());
    item.setB2bPrice(180_000, "cecile");
    item.withdraw(SORTIE);

    const revenu = item.refreshFromPim(facts({ priceMillicents: 210_000 }));

    expect(revenu.isWithdrawn).toBe(false);
    expect(revenu.effectivePriceMillicents).toBe(180_000);
  });

  it("naît en vente — un article reçu n'est jamais retiré", () => {
    expect(CatalogItem.receive(facts()).isWithdrawn).toBe(false);
  });
});
