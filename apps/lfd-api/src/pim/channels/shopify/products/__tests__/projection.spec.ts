import type { ProductEditorialView } from "../../../../catalogue/product/domain/ports/editorial-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { fingerprint, projectProduct } from "../projection.js";

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "p1",
    sku: "PATI-TARTE-FRAISE",
    name: { fr: "Tarte aux fraises" },
    slug: { fr: "tarte-aux-fraises" },
    kind: "made_to_order",
    categoryId: "c1",
    status: "draft",
    variants: [
      {
        id: "v1",
        sku: "PATI-TARTE-FRAISE-6P",
        name: { fr: "6 personnes" },
        options: { taille: "6 pers" },
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 2400,
        weightGrams: null,
        allergens: null,
        nutrition: null,
      },
    ],
    ...overrides,
  };
}

/** Aucun texte écrit — l'état d'un produit dont personne n'a rempli la Communication. */
const NOTHING_WRITTEN: ProductEditorialView = {
  descriptionShort: null,
  descriptionLong: null,
  story: null,
  pairing: null,
  brand: null,
  seoTitle: null,
  seoDescription: null,
};

function written(over: Partial<ProductEditorialView>): ProductEditorialView {
  return { ...NOTHING_WRITTEN, ...over };
}

describe("projection Shopify — la couche éditoriale", () => {
  it("porte la description longue, en paragraphes", () => {
    const payload = projectProduct(
      product(),
      written({ descriptionLong: { fr: "Pâte feuilletée.\n\nFraises de Provence." } }),
    );

    expect(payload.descriptionHtml).toBe("<p>Pâte feuilletée.</p><p>Fraises de Provence.</p>");
  });

  // Un rédacteur qui appuie une fois sur Entrée veut un retour à la ligne, pas
  // un paragraphe — et surtout pas que ses deux lignes se collent.
  it("transforme un retour simple en <br>", () => {
    const payload = projectProduct(
      product(),
      written({ descriptionLong: { fr: "Ligne 1\nLigne 2" } }),
    );

    expect(payload.descriptionHtml).toBe("<p>Ligne 1<br>Ligne 2</p>");
  });

  // Shopify n'a qu'un champ de description ; le résumé sert ailleurs (listes,
  // cartes, caisse). Mais un produit qui n'a QUE son résumé vaut mieux qu'un vide.
  it("retombe sur le résumé quand la longue manque", () => {
    const payload = projectProduct(
      product(),
      written({ descriptionShort: { fr: "Tarte de saison." } }),
    );

    expect(payload.descriptionHtml).toBe("<p>Tarte de saison.</p>");
  });

  it("préfère la longue quand les deux existent", () => {
    const payload = projectProduct(
      product(),
      written({ descriptionShort: { fr: "Court." }, descriptionLong: { fr: "Long." } }),
    );

    expect(payload.descriptionHtml).toBe("<p>Long.</p>");
  });

  /**
   * Le chemin d'injection : un texte de back-office ne doit JAMAIS devenir du
   * balisage sur la boutique. C'est le seul test de ce fichier qui protège
   * quelqu'un d'autre que nous.
   */
  it("échappe le balisage saisi au lieu de le rendre", () => {
    const payload = projectProduct(
      product(),
      written({ descriptionLong: { fr: '<script>alert("x")</script>' } }),
    );

    expect(payload.descriptionHtml).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
    expect(payload.descriptionHtml).not.toContain("<script>");
  });

  // Le modèle annonce du markdown, rien n'en a jamais rendu. Tant que c'est vrai,
  // une astérisque tapée pour elle-même doit rester une astérisque.
  it("n’interprète pas le markdown", () => {
    const payload = projectProduct(product(), written({ descriptionLong: { fr: "Beurre *AOP*" } }));

    expect(payload.descriptionHtml).toBe("<p>Beurre *AOP*</p>");
  });

  it("porte la marque en vendor et le SEO tel quel", () => {
    const payload = projectProduct(
      product(),
      written({
        brand: "Signature",
        seoTitle: { fr: "Tarte fraises" },
        seoDescription: { fr: "La meilleure." },
      }),
    );

    expect(payload.vendor).toBe("Signature");
    expect(payload.seo).toEqual({ title: "Tarte fraises", description: "La meilleure." });
  });

  // Shopify assigne lui-même un vendor à la création : une marque blanche ne
  // déclare rien de plus qu'une colonne absente, et n'a rien à écraser.
  it("ne déclare pas de marque quand elle est blanche", () => {
    expect(projectProduct(product(), written({ brand: "   " })).vendor).toBeNull();
  });

  it("part sans rien quand personne n’a écrit — la couche est optionnelle", () => {
    const payload = projectProduct(product(), null);

    expect(payload.descriptionHtml).toBe("");
    expect(payload.vendor).toBeNull();
    expect(payload.seo).toEqual({ title: "", description: "" });
  });

  // « Vidé » et « jamais écrit » disent la même chose au canal, à dessein : ce qui
  // compte est que l'ANCIEN texte parte, pas de savoir laquelle des deux causes l'a
  // effacé. Le contraire obligerait le canal à distinguer deux vides.
  it("traite « vidé » et « jamais écrit » de la même façon", () => {
    const cleared = projectProduct(product(), written({ descriptionLong: { fr: "" } }));
    const never = projectProduct(product(), null);

    expect(cleared.descriptionHtml).toBe("");
    expect(cleared.descriptionHtml).toBe(never.descriptionHtml);
  });

  it("change d’empreinte quand la description change", () => {
    const before = fingerprint(projectProduct(product(), null));
    const after = fingerprint(
      projectProduct(product(), written({ descriptionLong: { fr: "Neuf." } })),
    );

    expect(before).not.toBe(after);
  });
});

describe("projection Shopify", () => {
  it("projette le nom, l’identifiant d’URL et les déclinaisons", () => {
    const payload = projectProduct(product(), null);

    expect(payload.title).toBe("Tarte aux fraises");
    expect(payload.handle).toBe("tarte-aux-fraises");
    expect(payload.variants).toHaveLength(1);
    expect(payload.variants[0]?.sku).toBe("PATI-TARTE-FRAISE-6P");
    // Centimes canoniques → décimal texte Shopify.
    expect(payload.variants[0]?.price).toBe("24.00");
  });

  it("laisse le prix à null quand la déclinaison n’est pas tarifée", () => {
    const untarifed = product({
      variants: [{ ...product().variants[0]!, priceCents: null }],
    });

    expect(projectProduct(untarifed, null).variants[0]?.price).toBeNull();
  });

  // Le garde-fou qui compte : on ne met jamais un brouillon en ligne par inadvertance.
  it.each([
    ["draft", "DRAFT"],
    ["archived", "DRAFT"],
    ["published", "ACTIVE"],
  ] as const)("statut %s → %s", (status, expected) => {
    expect(projectProduct(product({ status }), null).status).toBe(expected);
  });

  it("omet les déclinaisons retirées de la vente", () => {
    const withRetired = product({
      variants: [
        { ...product().variants[0]!, id: "v2", isDiscontinued: true },
        product().variants[0]!,
      ],
    });

    expect(projectProduct(withRetired, null).variants).toHaveLength(1);
  });

  describe("empreinte", () => {
    it("est stable pour un contenu identique", () => {
      expect(fingerprint(projectProduct(product(), null))).toBe(
        fingerprint(projectProduct(product(), null)),
      );
    });

    // Sans tri des clés, deux objets équivalents produiraient deux empreintes :
    // tout paraîtrait modifié en permanence et on repousserait sans cesse.
    it("ignore l’ordre des clés d’options", () => {
      const first = product({
        variants: [
          {
            ...product().variants[0]!,
            options: { taille: "6 pers", parfum: "fraise" },
          },
        ],
      });
      const second = product({
        variants: [
          {
            ...product().variants[0]!,
            options: { parfum: "fraise", taille: "6 pers" },
          },
        ],
      });

      expect(fingerprint(projectProduct(first, null))).toBe(
        fingerprint(projectProduct(second, null)),
      );
    });

    it("change dès que le contenu poussé change", () => {
      const renamed = product({ name: { fr: "Tarte aux framboises" } });

      expect(fingerprint(projectProduct(product(), null))).not.toBe(
        fingerprint(projectProduct(renamed, null)),
      );
    });
  });
});
