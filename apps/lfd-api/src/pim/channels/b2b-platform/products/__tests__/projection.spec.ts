import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";
import type { ChannelCategory } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type {
  ProductRecord,
  VariantRecord,
} from "../../../../catalogue/product/domain/ports/product.repository.js";
import { projectCatalog } from "../projection.js";

const AT = "2026-08-17T08:00:00.000Z";

function variant(over: Partial<VariantRecord> = {}): VariantRecord {
  return {
    id: "var_1",
    sku: "VIE-001-1",
    name: { fr: "Croissant" },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 200,
    priceBasis: "ht",
    weightGrams: null,
    allergens: null,
    nutrition: null,
    ...over,
  };
}

function product(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "prd_1",
    sku: "VIE-001",
    name: { fr: "Croissant" },
    slug: { fr: "croissant" },
    kind: "daily",
    categoryId: "cat_vien",
    status: "published",
    channelOverride: null,
    variants: [variant()],
    vatByContext: {},
    ...over,
  };
}

function category(over: Partial<ChannelCategory> = {}): ChannelCategory {
  return {
    id: "cat_vien",
    name: { fr: "Viennoiseries" },
    slug: { fr: "viennoiseries" },
    parentId: null,
    position: 0,
    vatByContext: { takeaway: 5.5, b2b: 5.5 },
    ...over,
  };
}

/**
 * Le taux EFFECTIF de chaque fiche, résolu en amont : ici, celui de la famille.
 * Les tests qui parlent d'une dérogation le passent explicitement — c'est tout
 * l'intérêt de le recevoir plutôt que de le déduire.
 */
function vat(percents: Record<string, number> = { takeaway: 5.5, b2b: 5.5 }) {
  return new Map([["prd_1", percents]]);
}

/**
 * Où la fiche se vend, résolu en amont. Par défaut : chez les professionnels —
 * sans quoi ce canal l'écarte, et c'est bien le but.
 */
function sold(channels: SalesChannels = [{ pointOfSaleId: "pos_b2b", context: "b2b" }]) {
  return new Map([["prd_1", channels]]);
}

describe("projectCatalog", () => {
  it("projette un produit tarifé, avec le taux de TVA de sa famille", () => {
    const { snapshot, excluded } = projectCatalog([product()], [category()], vat(), sold(), AT);

    expect(excluded).toEqual([]);
    expect(snapshot.generatedAt).toBe(AT);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.products[0]?.variants[0]?.priceCents).toBe(200);
    expect(snapshot.categories[0]?.vatRatePercent).toBe(5.5);
  });

  /**
   * Le cœur de l'ancrage : la plateforme professionnelle facture en HORS TAXE,
   * toujours. Un article dont le prix est celui de l'étiquette est converti
   * ici, au dernier endroit qui connaît encore son assiette — 1,20 € TTC à
   * 5,5 % partent à 1,14 € HT.
   */
  it("convertit un prix ancré au TTC en hors taxe avant de l'envoyer", () => {
    const { snapshot, excluded } = projectCatalog(
      [product({ variants: [variant({ priceCents: 120, priceBasis: "ttc" })] })],
      [category()],
      vat(),
      sold(),
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.products[0]?.variants[0]?.priceCents).toBe(114);
  });

  /**
   * Un même prix d'étiquette ne donne pas le même hors taxe selon le taux —
   * c'est la raison d'être de tout le chantier, vérifiée de bout en bout de la
   * projection et pas seulement dans la fonction de conversion.
   */
  it("fait dépendre le HT du taux, à prix d'étiquette égal", () => {
    const ttcVariant = { variants: [variant({ priceCents: 120, priceBasis: "ttc" as const })] };
    const at55 = projectCatalog([product(ttcVariant)], [category()], vat(), sold(), AT);
    const at10 = projectCatalog([product(ttcVariant)], [category()], vat({ b2b: 10 }), sold(), AT);

    expect(at55.snapshot.products[0]?.variants[0]?.priceCents).toBe(114);
    expect(at10.snapshot.products[0]?.variants[0]?.priceCents).toBe(109);
  });

  /**
   * Écarté, pas converti au jugé : un prix d'étiquette sans taux n'a pas de
   * hors taxe. Le motif est distinct de « pas de tarif » — ici le prix existe,
   * c'est le taux qui manque, et c'est un autre écran qu'il faut ouvrir.
   */
  it("écarte un prix ancré au TTC quand le contexte B2B n'a pas de taux", () => {
    const { snapshot, excluded } = projectCatalog(
      [product({ variants: [variant({ priceCents: 120, priceBasis: "ttc" })] })],
      [category()],
      vat({ takeaway: 5.5 }),
      sold(),
      AT,
    );

    expect(excluded).toContainEqual({ sku: "VIE-001-1", reason: "variant_ttc_sans_taux" });
    expect(snapshot.products).toHaveLength(0);
  });

  /**
   * Un prix HORS TAXE, lui, part sans taux : il n'a jamais eu besoin d'un taux
   * pour être ce qu'il est. C'est la garantie que l'ancrage n'a rien resserré
   * au passage — la plateforme écarte ces articles de sa boutique, mais le prix
   * canonique, lui, a de la valeur.
   */
  it("laisse passer un prix hors taxe même sans taux B2B", () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      vat({ takeaway: 5.5 }),
      sold(),
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.products[0]?.variants[0]?.priceCents).toBe(200);
    expect(snapshot.products[0]?.variants[0]?.vatRatePercent).toBeNull();
  });

  it("facture la DÉROGATION de la fiche, pas le taux de sa famille", () => {
    // La famille est à 5,5 % ; cette fiche-là déroge à 20 %. Sans ça, il aurait
    // fallu lui inventer une famille — et une famille de un n'est plus une
    // famille.
    const { snapshot } = projectCatalog(
      [product()],
      [category()],
      vat({ takeaway: 5.5, b2b: 20 }),
      sold(),
      AT,
    );

    expect(snapshot.products[0]?.variants[0]?.vatRatePercent).toBe(20);
  });

  it("facture au taux B2B, JAMAIS à celui « à emporter »", () => {
    // Le canal lisait `emporterVatPercent` faute d'avoir le sien : les
    // professionnels étaient facturés au taux de la vente au comptoir, sans que
    // rien ne le dise et sans qu'aucun écran ne permette de le corriger. Les
    // deux valeurs diffèrent ici précisément pour que l'emprunt ne puisse plus
    // passer inaperçu.
    const { snapshot } = projectCatalog(
      [product()],
      [category({ vatByContext: { takeaway: 5.5, b2b: 20 } })],
      vat({ takeaway: 5.5, b2b: 20 }),
      sold(),
      AT,
    );

    expect(snapshot.categories[0]?.vatRatePercent).toBe(20);
    expect(snapshot.products[0]?.variants[0]?.vatRatePercent).toBe(20);
  });

  it("ne lit aucune horloge : l’instant d’émission est celui qu’on lui passe", () => {
    const { snapshot } = projectCatalog([product()], [category()], vat(), sold(), AT);

    expect(snapshot.generatedAt).toBe(AT);
  });

  it("écarte une déclinaison sans prix, et le DIT", () => {
    const priceless = product({
      variants: [variant({ sku: "VIE-001-1", priceCents: null })],
    });

    const { snapshot, excluded } = projectCatalog([priceless], [category()], vat(), sold(), AT);

    expect(excluded).toContainEqual({
      sku: "VIE-001-1",
      reason: "variant_sans_prix",
    });
    expect(snapshot.products).toEqual([]);
  });

  it("distingue « arrêtée » d’« oubli de prix » — seul le second est actionnable", () => {
    const mixed = product({
      variants: [
        variant({ sku: "A", isDiscontinued: true }),
        variant({ sku: "B", priceCents: null }),
        variant({ sku: "C", priceCents: 300 }),
      ],
    });

    const { snapshot, excluded } = projectCatalog([mixed], [category()], vat(), sold(), AT);

    expect(excluded).toContainEqual({ sku: "A", reason: "variant_arretee" });
    expect(excluded).toContainEqual({ sku: "B", reason: "variant_sans_prix" });
    expect(snapshot.products[0]?.variants.map((v) => v.sku)).toEqual(["C"]);
  });

  it("écarte un produit dont plus aucune déclinaison n’est vendable", () => {
    const dead = product({
      variants: [variant({ sku: "A", isDiscontinued: true })],
    });

    const { snapshot, excluded } = projectCatalog([dead], [category()], vat(), sold(), AT);

    expect(excluded).toContainEqual({
      sku: "VIE-001",
      reason: "produit_sans_variante_vendable",
    });
    expect(snapshot.products).toEqual([]);
  });

  /**
   * Une famille non réglée ne bloque plus le voyage : le prix canonique a de la
   * valeur sans le taux, et un écran de paramétrage n'a pas besoin de savoir
   * facturer. Le refus n'a pas disparu, il est déplacé — c'est la BOUTIQUE qui
   * écarte un article sans taux, jamais un défaut à 5,5 %.
   */
  it("pousse un produit dont la famille n’a pas de TVA, avec un taux null", () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category({ vatByContext: { takeaway: 5.5 } })],
      vat(),
      sold(),
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.categories[0]?.vatRatePercent).toBeNull();
  });

  it("écarte un produit dont la famille est inconnue", () => {
    const orphan = product({ categoryId: "cat_fantome" });

    const { excluded } = projectCatalog([orphan], [category()], vat(), sold(), AT);

    expect(excluded).toEqual([{ sku: "VIE-001", reason: "famille_inconnue" }]);
  });

  it("ne pousse que les familles réellement utilisées", () => {
    const unused = category({ id: "cat_vide", name: { fr: "Vide" } });

    const { snapshot } = projectCatalog([product()], [category(), unused], vat(), sold(), AT);

    expect(snapshot.categories.map((c) => c.id)).toEqual(["cat_vien"]);
  });

  it("aplatit les textes en français", () => {
    const bilingual = product({
      name: { fr: "Croissant", en: "Croissant" },
    });

    const { snapshot } = projectCatalog([bilingual], [category()], vat(), sold(), AT);

    expect(snapshot.products[0]?.name).toBe("Croissant");
  });

  it("rend un snapshot vide sans rien inventer quand rien n’est publié", () => {
    const { snapshot, excluded } = projectCatalog([], [category()], vat(), sold(), AT);

    expect(snapshot.products).toEqual([]);
    expect(snapshot.categories).toEqual([]);
    expect(excluded).toEqual([]);
  });
});

describe("projectCatalog — la matrice DÉCIDE", () => {
  it("écarte une fiche qu'on ne vend pas aux professionnels, et le DIT", () => {
    // La matrice ne décrivait rien qu'elle-même : fermer le B2B sur une fiche
    // la laissait en vente. Écartée du snapshot, elle sort de la boutique au
    // push suivant — l'ingestion supprime ce qui n'arrive plus.
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      vat(),
      sold([{ pointOfSaleId: "emp_1", context: "takeaway" }]),
      AT,
    );

    expect(snapshot.products).toEqual([]);
    expect(excluded).toEqual([{ sku: "VIE-001", reason: "canal_ferme" }]);
  });

  it("écarte aussi une fiche dont on ignore les canaux, plutôt que de la pousser", () => {
    // Une carte sans entrée pour ce produit veut dire « on n'a pas résolu » —
    // et sur une boutique, ne pas savoir n'autorise pas à vendre.
    const { snapshot, excluded } = projectCatalog([product()], [category()], vat(), new Map(), AT);

    expect(snapshot.products).toEqual([]);
    expect(excluded).toEqual([{ sku: "VIE-001", reason: "canal_ferme" }]);
  });
});
