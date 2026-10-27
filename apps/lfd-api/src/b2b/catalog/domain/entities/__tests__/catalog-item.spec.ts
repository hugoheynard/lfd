import { CannotFeatureHiddenItemError } from "../../errors/catalog-errors.js";
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
    mayContain: null,
    allergensPrecautionary: false,
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
    orderTimeLimit: null,
    productId: "prd_1",
    productSku: "VIE-001",
    name: "Croissant",
    kind: "daily",
    categoryId: "fam-vien",
    priceMillicents: 200,
    weightGrams: null,
    isDefault: true,
    position: 0,
    vatRatePercent: 5.5,
    publicTtcCents: 250,
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
    receivedAt: new Date("2026-08-17T08:00:00.000Z"),
    ...over,
  };
}

/**
 * **Le prix est celui du référentiel, et lui seul** (lot D de
 * `plan-catalogue-synchronise-par-audience.md`, 2026-10-15) : l'agrégat ne
 * porte plus de décision de prix, et un push qui change le prix le change.
 */
describe("CatalogItem — le prix", () => {
  it("porte le prix du référentiel, sans décision", () => {
    const item = CatalogItem.receive(facts());

    expect(item.pimPriceMillicents).toBe(200);
    expect(item.toPersistence().decision).toBeNull();
  });

  it("suit le référentiel au push, même sur un article masqué", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    const refreshed = item.refreshFromPim(facts({ priceMillicents: 220 }));

    expect(refreshed.pimPriceMillicents).toBe(220);
  });

  /**
   * 🔴 La décision persistée ne porte plus aucune colonne de prix : l'adaptateur
   * étale l'objet dans l'`upsert`, et une clé de prix y réécrirait les colonnes
   * conservées (correction BLOQUANT de `vitruve`, 2026-10-15).
   */
  it("🔴 ne persiste aucune clé de prix dans la décision", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    expect(Object.keys(item.toPersistence().decision ?? {}).sort()).toEqual([
      "decidedBy",
      "isFeaturedPro",
      "isFeaturedPublic",
      "isHidden",
      "isHiddenPublic",
    ]);
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
    item.feature("pro", "cecile");

    item.hide("cecile");

    expect(item.isFeaturedFor("pro")).toBe(false);
  });

  /**
   * L'inverse est ambigu, donc refusé : sans ça, un commercial croirait avoir
   * mis en vitrine un produit que personne ne voit.
   */
  it("refuse de mettre en avant un article masqué", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    expect(() => item.feature("pro", "cecile")).toThrow(CannotFeatureHiddenItemError);
  });

  it("réafficher puis mettre en avant fonctionne", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");

    item.show("cecile");
    item.feature("pro", "cecile");

    expect(item.isFeaturedFor("pro")).toBe(true);
  });
});

describe("CatalogItem — le push", () => {
  /**
   * L'invariant central du chantier. Il n'est pas surveillé : `refreshFromPim`
   * n'écrit que les faits, donc perdre la décision n'est pas exprimable.
   */
  it("rafraîchir depuis le PIM garde la décision locale", () => {
    const item = CatalogItem.receive(facts());
    item.hidePublic("cecile");

    const refreshed = item.refreshFromPim(
      facts({ priceMillicents: 220, name: "Croissant beurre" }),
    );

    expect(refreshed.pimPriceMillicents).toBe(220);
    expect(refreshed.isHiddenPublic).toBe(true);
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
    item.hide("cecile");

    item.withdraw(SORTIE);

    expect(item.isWithdrawn).toBe(true);
    expect(item.toPersistence()).toMatchObject({
      withdrawnAt: SORTIE,
      decision: { isHidden: true, decidedBy: "cecile" },
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
   * rend le retrait réversible — et la décision le retrouve, puisqu'elle
   * traverse `refreshFromPim`.
   */
  it("un push qui rapporte l'article le remet en vente, décision comprise", () => {
    const item = CatalogItem.receive(facts());
    item.hide("cecile");
    item.withdraw(SORTIE);

    const revenu = item.refreshFromPim(facts({ priceMillicents: 210_000 }));

    expect(revenu.isWithdrawn).toBe(false);
    expect(revenu.isHidden).toBe(true);
  });

  it("naît en vente — un article reçu n'est jamais retiré", () => {
    expect(CatalogItem.receive(facts()).isWithdrawn).toBe(false);
  });
});

/**
 * **Une décision neutre ne fait pas supprimer la ligne** (lot D, correction
 * BLOQUANT de `vitruve`, 2026-10-15) : l'agrégat dit seulement « plus rien de
 * décidé », et c'est à l'adaptateur de remettre les drapeaux à `false` sans
 * jamais supprimer — la ligne porte peut-être un ancien prix décidé.
 */
describe("CatalogItem — la décision neutre", () => {
  it("rend `decision: null` quand le dernier masque est levé", () => {
    const item = CatalogItem.receive(facts());
    item.hidePublic("cecile");

    item.showPublic("cecile");

    expect(item.toPersistence().decision).toBeNull();
  });

  it("🔴 retient la décision quand la mise en avant est la SEULE", () => {
    const item = CatalogItem.receive(facts());

    item.feature("pro", "cecile");

    expect(item.toPersistence().decision).toMatchObject({ isFeaturedPro: true });
  });
});
