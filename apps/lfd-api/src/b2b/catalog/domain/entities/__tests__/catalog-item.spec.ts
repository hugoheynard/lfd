import {
  CannotFeatureHiddenItemError,
  InvalidB2bPriceError,
  InvalidPublicPriceError,
  PublicPriceWithoutContextError,
  RedundantB2bPriceError,
  RedundantPublicPriceError,
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
    note: null,
    image: null,
    thumbnail: null,
    orderTimeLimit: null,
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
    publicTtcCents: 250,
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
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

  /**
   * Le journal en dépend (2026-09-19) : un prix B2B que le PIM a rejoint reste
   * une décision, et le prix effectif seul ne permet plus de la voir.
   */
  it("dit le prix B2B décidé, même quand le PIM l'a rejoint", () => {
    const item = CatalogItem.receive(facts());
    expect(item.b2bPriceMillicents).toBeNull();

    item.setB2bPrice(180, "cecile");
    const rejoined = item.refreshFromPim(facts({ priceMillicents: 180 }));

    expect(rejoined.effectivePriceMillicents).toBe(rejoined.pimPriceMillicents);
    expect(rejoined.b2bPriceMillicents).toBe(180);
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

/**
 * **Le prix public**, et ce qui le distingue de son voisin professionnel.
 *
 * Les deux décisions vivent sur le même override et ne se touchent pas : c'est
 * ce que ces cas tiennent, parce que rien dans les types ne l'empêche.
 */
describe("CatalogItem — le prix public", () => {
  const CONTEXT = "takeaway";

  it("suit l'étiquette du PIM tant que personne n'a rien décidé", () => {
    const item = CatalogItem.receive(facts());

    expect(item.decidedPublicTtcCents).toBeNull();
    expect(item.toPersistence().decision).toBeNull();
  });

  it("se pose en centimes TTC, sans toucher au prix professionnel", () => {
    const item = CatalogItem.receive(facts());

    item.setPublicPrice(299, CONTEXT, "cecile");

    expect(item.decidedPublicTtcCents).toBe(299);
    // Le canal pro n'a pas bougé : deux audiences, deux décisions.
    expect(item.effectivePriceMillicents).toBe(200);
  });

  it("refuse un prix nul, négatif ou à virgule — un centime ne se coupe pas", () => {
    const item = CatalogItem.receive(facts());

    expect(() => item.setPublicPrice(0, CONTEXT, null)).toThrow(InvalidPublicPriceError);
    expect(() => item.setPublicPrice(-120, CONTEXT, null)).toThrow(InvalidPublicPriceError);
    expect(() => item.setPublicPrice(12.5, CONTEXT, null)).toThrow(InvalidPublicPriceError);
  });

  /**
   * Même règle que le prix professionnel : recopier l'étiquette annoncerait une
   * décision qui n'en est pas une, et empêcherait la prochaine étiquette du
   * référentiel de passer.
   */
  it("refuse l'étiquette du PIM recopiée — le geste voulu est d'y revenir", () => {
    const item = CatalogItem.receive(facts());

    expect(() => item.setPublicPrice(250, CONTEXT, null)).toThrow(RedundantPublicPriceError);
  });

  /**
   * 🔴 **Le refus qui n'a pas d'équivalent côté pro.** La vitrine publique
   * écarte déjà un article dont le miroir ne porte pas ce contexte : accepter
   * le prix l'écrirait, l'afficherait au back-office comme une décision prise,
   * et ne le servirait jamais. Un prix qu'on croit posé est pire qu'un prix
   * refusé.
   */
  it("🔴 refuse un prix sur un article que la vitrine publique n'expose pas", () => {
    const item = CatalogItem.receive(facts({ publicByContext: null }));

    expect(() => item.setPublicPrice(299, CONTEXT, null)).toThrow(PublicPriceWithoutContextError);
  });

  it("refuse aussi quand le miroir porte d'AUTRES contextes, mais pas celui-là", () => {
    // Le cas qu'un refus formulé sur « a-t-il un taux public ? » laisserait
    // passer : la carte existe, elle est garnie, et la clé servie n'y est pas.
    const item = CatalogItem.receive(
      facts({ publicByContext: { eatIn: { vatRatePercent: 10, htMillicents: 227_273 } } }),
    );

    expect(() => item.setPublicPrice(299, CONTEXT, null)).toThrow(PublicPriceWithoutContextError);
  });

  it("revient à l'étiquette du PIM sans toucher au prix professionnel", () => {
    const item = CatalogItem.receive(facts());
    item.setPublicPrice(299, CONTEXT, "cecile");
    item.setB2bPrice(180, "cecile");

    item.alignPublicOnPim();

    expect(item.decidedPublicTtcCents).toBeNull();
    expect(item.effectivePriceMillicents).toBe(180);
  });

  /**
   * 🔴 **Régression du champ oublié.** `toPersistence()` rend `decision: null`
   * quand plus rien n'est décidé, et l'adaptateur SUPPRIME alors la ligne. Un
   * prix public absent de ce test rendrait `untouched` vrai : la ligne serait
   * effacée, et le prix disparaîtrait au prochain push du PIM — loin du geste,
   * donc loin de sa cause.
   */
  it("🔴 retient la ligne quand le prix public est la SEULE décision", () => {
    const item = CatalogItem.receive(facts());

    item.setPublicPrice(299, CONTEXT, "cecile");

    expect(item.toPersistence().decision).toMatchObject({
      decidedPublicTtcCents: 299,
      priceMillicents: null,
    });
  });

  it("rend la ligne effaçable quand la dernière décision est retirée", () => {
    const item = CatalogItem.receive(facts());
    item.setPublicPrice(299, CONTEXT, "cecile");

    item.alignPublicOnPim();

    expect(item.toPersistence().decision).toBeNull();
  });
});
