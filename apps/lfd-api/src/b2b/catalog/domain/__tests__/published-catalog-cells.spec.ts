import {
  publishedCellOf,
  type PublishedArticle,
  type PublishedCellInput,
} from "../published-catalog-cells.js";

/** L'état d'une cellule de la vue « Catalogue publié » (lot 3), règle par règle. */

const ARTICLE: PublishedArticle = {
  isHidden: false,
  isHiddenPublic: false,
  reviewPending: { pro: false, public: false },
  billableTo: { pro: true, public: true },
};

function input(over: Partial<PublishedCellInput> = {}): PublishedCellInput {
  return { entryActive: true, audience: "both", hasGaps: false, article: ARTICLE, ...over };
}

describe("publishedCellOf", () => {
  it("rend « en vente » aux deux audiences un article complet, actif et validé", () => {
    expect(publishedCellOf("pro", input())).toBe("en_vente");
    expect(publishedCellOf("public", input())).toBe("en_vente");
  });

  it("dit « pas vendu » hors de l'audience, avant tout manque", () => {
    const proOnly = input({ audience: "pro", hasGaps: true });
    expect(publishedCellOf("public", proOnly)).toBe("pas_vendu");
    expect(publishedCellOf("pro", proOnly)).toBe("incomplet");
  });

  it("dit « inactif » pour une fiche inactive, manques compris, après l'audience", () => {
    const inactive = input({ entryActive: false, article: null, hasGaps: true });
    expect(publishedCellOf("pro", inactive)).toBe("inactif");
    expect(publishedCellOf("public", { ...inactive, audience: "pro" })).toBe("pas_vendu");
  });

  it("dit « pas vendu » pour une fiche active dont la mise en vente n'est pas appliquée", () => {
    expect(publishedCellOf("pro", input({ article: null }))).toBe("pas_vendu");
  });

  it("dit « incomplet » sans taux pro ou sans étiquette publique", () => {
    const article = { ...ARTICLE, billableTo: { pro: false, public: false } };
    expect(publishedCellOf("pro", input({ article }))).toBe("incomplet");
    expect(publishedCellOf("public", input({ article }))).toBe("incomplet");
  });

  it("met en attente chaque audience séparément, avant le masquage", () => {
    const article = {
      ...ARTICLE,
      reviewPending: { pro: false, public: true },
      isHiddenPublic: true,
    };
    expect(publishedCellOf("public", input({ article }))).toBe("en_attente_validation");
    expect(publishedCellOf("pro", input({ article }))).toBe("en_vente");
    const proPending = { ...ARTICLE, reviewPending: { pro: true, public: false } };
    expect(publishedCellOf("pro", input({ article: proPending }))).toBe("en_attente_validation");
  });

  it("dit « masqué » par audience", () => {
    const article = { ...ARTICLE, isHidden: true };
    expect(publishedCellOf("pro", input({ article }))).toBe("masque");
    expect(publishedCellOf("public", input({ article }))).toBe("en_vente");
  });
});
