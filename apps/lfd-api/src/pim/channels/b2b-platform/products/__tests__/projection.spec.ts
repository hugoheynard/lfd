import type { SalesChannels } from "../../../../catalogue/shared/domain/value-objects/sales-channels.js";
import type { ChannelCategory } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type {
  ProductRecord,
  VariantRecord,
} from "../../../../catalogue/product/domain/ports/product.repository.js";
import { AllergenStore } from "../../../../allergens/application/__tests__/in-memory-allergens.js";
import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
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
    weightGrams: null,
    regulatoryFollowsDefault: false,
    pricingFollowsDefault: false,
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

/**
 * Le rapport **neutre** : le pro paie le prix public.
 *
 * Une valeur explicite plutôt qu'un défaut dans la signature — la projection
 * n'en a pas, délibérément, et un défaut ici la rendrait à nouveau facultative
 * dans l'esprit du lecteur. `10 000` dit « aucune remise », ce qui est un
 * réglage possible et pas une absence de réglage.
 */
const NO_DISCOUNT = 10_000;

/**
 * Le référentiel d'allergènes tel que la base le sert, **passé** à la projection
 * (D6). Trois entrées suffisent à couvrir les trois sorts d'un code déclaré :
 *
 * - `UW` (blé) et `NR` (seigle) — deux codes qui retombent sur UNE mention,
 *   c'est le n:1 qui est la raison d'être du modèle ;
 * - `SO` (noix de coco) — officiel, **sans obligation UE**, donc écarté de la
 *   mention d'étiquette sans être inconnu.
 */
const INCO = incoProjector();

function incoProjector(): IncoProjector {
  const store = new AllergenStore();
  store.seedOfficialCategory("alg_cat_gluten", "gluten", "gluten");
  store.seedOfficialEntry("alg_UW", "UW", "alg_cat_gluten");
  store.seedOfficialEntry("alg_NR", "NR", "alg_cat_gluten");
  store.seedOfficialCategory("alg_cat_non_eu", "non_eu", null);
  store.seedOfficialEntry("alg_SO", "SO", "alg_cat_non_eu");
  return IncoProjector.from(catalogueOf(store), "fr");
}

/** Le lecteur est asynchrone ; la projection, elle, reçoit un objet pur. */
function catalogueOf(store: AllergenStore) {
  const categories = [...store.categories.values()].sort((a, b) => a.position - b.position);
  return categories.map((category) => ({
    ...category,
    entries: [...store.entries.values()]
      .filter((entry) => entry.categoryId === category.id)
      .map(({ categoryId, ...entry }) => {
        void categoryId;
        return entry;
      }),
  }));
}

describe("projectCatalog", () => {
  it("projette un produit tarifé, avec le taux de TVA de sa famille", () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.generatedAt).toBe(AT);
    expect(snapshot.products).toHaveLength(1);
    // 2,00 € d'étiquette à 5,5 % → 1,89573… € HT. Le prix stocké EST un prix
    // public TTC : il n'y a plus de cas où il traverse sans conversion.
    expect(snapshot.products[0]?.variants[0]?.priceMillicents).toBe(189_573);
    expect(snapshot.categories[0]?.vatRatePercent).toBe(5.5);
  });

  /**
   * Le cœur de l'ancrage : la plateforme professionnelle facture en HORS TAXE,
   * toujours. Le prix d'une déclinaison est celui de l'étiquette, et c'est ici
   * qu'il devient un hors taxe — 1,20 € TTC à 5,5 % partent à 1,14 € HT.
   */
  it("convertit le prix d'étiquette en hors taxe avant de l'envoyer", () => {
    const { snapshot, excluded } = projectCatalog(
      [product({ variants: [variant({ priceCents: 120 })] })],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toEqual([]);
    // 1,20 € TTC ÷ 1,055 = 1,137440… € → 113 744 millicentimes. Les décimales
    // survivent jusqu'au total de ligne, où l'arrondi aura lieu une fois.
    expect(snapshot.products[0]?.variants[0]?.priceMillicents).toBe(113_744);
  });

  /**
   * **Le raccordement du rapport.** Le prix poussé est un hors taxe
   * PROFESSIONNEL : prix public TTC × rapport, puis ÷ taux du canal.
   *
   * Sans lui, la fiche affichait une ligne B2B remisée et le fil envoyait le
   * plein tarif. Personne ne voyait l'écart : les deux nombres ne se lisent pas
   * sur le même écran.
   */
  it("applique le rapport pro AVANT d'en déduire le hors taxe", () => {
    const { snapshot } = projectCatalog(
      [product({ variants: [variant({ priceCents: 1_200 })] })],
      [category()],
      vat({ b2b: 20 }),
      sold(),
      9_000,
      INCO,
      AT,
    );

    // 12,00 € public × 90 % = 10,80 € pro TTC ; ÷ 1,20 = 9,00 € HT exactement.
    expect(snapshot.products[0]?.variants[0]?.priceMillicents).toBe(900_000);
  });

  /**
   * **L'accord entre l'écran et le fil**, qui est tout l'intérêt de l'ordre des
   * arrondis : le prix pro est arrondi au centime AVANT la division, parce que
   * c'est un prix. Garder le rationnel exact jusqu'au bout ferait diverger d'un
   * centime le hors taxe poussé et celui que la fiche montre sous le prix pro.
   */
  it("arrondit le prix pro au centime avant de diviser", () => {
    const { snapshot } = projectCatalog(
      // 1,99 € × 90 % = 1,791 € → 1,79 € pro TTC (arrondi ICI).
      [product({ variants: [variant({ priceCents: 199 })] })],
      [category()],
      vat({ b2b: 5.5 }),
      sold(),
      9_000,
      INCO,
      AT,
    );

    // 1,79 € ÷ 1,055 = 1,696682… € → 169 668 millicentimes. Partir du rationnel
    // exact (1,791 €) donnerait 169 763 : un centime d'écart avec l'écran.
    expect(snapshot.products[0]?.variants[0]?.priceMillicents).toBe(169_668);
  });

  /**
   * Un même prix d'étiquette ne donne pas le même hors taxe selon le taux —
   * c'est la raison d'être de tout le chantier, vérifiée de bout en bout de la
   * projection et pas seulement dans la fonction de conversion.
   */
  it("fait dépendre le HT du taux, à prix d'étiquette égal", () => {
    const ttcVariant = { variants: [variant({ priceCents: 120 })] };
    const at55 = projectCatalog(
      [product(ttcVariant)],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );
    const at10 = projectCatalog(
      [product(ttcVariant)],
      [category()],
      vat({ b2b: 10 }),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(at55.snapshot.products[0]?.variants[0]?.priceMillicents).toBe(113_744);
    expect(at10.snapshot.products[0]?.variants[0]?.priceMillicents).toBe(109_091);
  });

  /**
   * Écarté, pas converti au jugé : un prix d'étiquette sans taux n'a pas de
   * hors taxe. Le motif est distinct de « pas de tarif » — ici le prix existe,
   * c'est le taux qui manque, et c'est un autre écran qu'il faut ouvrir.
   */
  it("écarte un prix quand le contexte B2B n'a pas de taux", () => {
    const { snapshot, excluded } = projectCatalog(
      [product({ variants: [variant({ priceCents: 120 })] })],
      [category()],
      vat({ takeaway: 5.5 }),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toContainEqual({ sku: "VIE-001-1", reason: "variant_sans_taux" });
    expect(snapshot.products).toHaveLength(0);
  });

  /**
   * **Plus aucun prix ne traverse sans taux.** Ce cas disait l'inverse : un
   * montant hors taxe partait tel quel, n'ayant jamais eu besoin d'un taux
   * pour être ce qu'il est. Cette porte s'est fermée avec l'assiette — tout
   * prix est désormais un prix d'étiquette, et un prix d'étiquette sans taux
   * n'a pas de hors taxe.
   */
  it("n'a plus de chemin sans taux : rien ne traverse tel quel", () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      vat({ takeaway: 5.5 }),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.products).toEqual([]);
    expect(excluded).toContainEqual({ sku: "VIE-001-1", reason: "variant_sans_taux" });
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
      NO_DISCOUNT,
      INCO,
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
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.categories[0]?.vatRatePercent).toBe(20);
    expect(snapshot.products[0]?.variants[0]?.vatRatePercent).toBe(20);
  });

  it("ne lit aucune horloge : l’instant d’émission est celui qu’on lui passe", () => {
    const { snapshot } = projectCatalog(
      [product()],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.generatedAt).toBe(AT);
  });

  it("écarte une déclinaison sans prix, et le DIT", () => {
    const priceless = product({
      variants: [variant({ sku: "VIE-001-1", priceCents: null })],
    });

    const { snapshot, excluded } = projectCatalog(
      [priceless],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

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

    const { snapshot, excluded } = projectCatalog(
      [mixed],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toContainEqual({ sku: "A", reason: "variant_arretee" });
    expect(excluded).toContainEqual({ sku: "B", reason: "variant_sans_prix" });
    expect(snapshot.products[0]?.variants.map((v) => v.sku)).toEqual(["C"]);
  });

  it("écarte un produit dont plus aucune déclinaison n’est vendable", () => {
    const dead = product({
      variants: [variant({ sku: "A", isDiscontinued: true })],
    });

    const { snapshot, excluded } = projectCatalog(
      [dead],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

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
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.categories[0]?.vatRatePercent).toBeNull();
  });

  it("écarte un produit dont la famille est inconnue", () => {
    const orphan = product({ categoryId: "cat_fantome" });

    const { excluded } = projectCatalog(
      [orphan],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(excluded).toEqual([{ sku: "VIE-001", reason: "famille_inconnue" }]);
  });

  it("ne pousse que les familles réellement utilisées", () => {
    const unused = category({ id: "cat_vide", name: { fr: "Vide" } });

    const { snapshot } = projectCatalog(
      [product()],
      [category(), unused],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.categories.map((c) => c.id)).toEqual(["cat_vien"]);
  });

  it("aplatit les textes en français", () => {
    const bilingual = product({
      name: { fr: "Croissant", en: "Croissant" },
    });

    const { snapshot } = projectCatalog(
      [bilingual],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.products[0]?.name).toBe("Croissant");
  });

  it("rend un snapshot vide sans rien inventer quand rien n’est publié", () => {
    const { snapshot, excluded } = projectCatalog(
      [],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

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
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.products).toEqual([]);
    expect(excluded).toEqual([{ sku: "VIE-001", reason: "canal_ferme" }]);
  });

  it("écarte aussi une fiche dont on ignore les canaux, plutôt que de la pousser", () => {
    // Une carte sans entrée pour ce produit veut dire « on n'a pas résolu » —
    // et sur une boutique, ne pas savoir n'autorise pas à vendre.
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      vat(),
      new Map(),
      NO_DISCOUNT,
      INCO,
      AT,
    );

    expect(snapshot.products).toEqual([]);
    expect(excluded).toEqual([{ sku: "VIE-001", reason: "canal_ferme" }]);
  });
});

/**
 * **Le fil transporte désormais les mentions d'étiquette** (D6). La plateforme
 * B2B n'a plus le référentiel réglementaire : projeter là-bas exigerait d'y
 * dupliquer du droit, donc de le laisser dériver.
 *
 * Les codes ne bougent pas — ils restent le stockage canonique, et ce sont eux
 * qui portent les trois états.
 */
describe("projectCatalog — les allergènes", () => {
  function labelsOf(codes: readonly string[] | null) {
    const { snapshot } = projectCatalog(
      [product({ variants: [variant({ allergens: codes })] })],
      [category()],
      vat(),
      sold(),
      NO_DISCOUNT,
      INCO,
      AT,
    );
    return snapshot.products[0]?.variants[0];
  }

  it("pousse les codes ET leurs mentions", () => {
    expect(labelsOf(["UW"])).toMatchObject({
      allergens: ["UW"],
      allergenLabels: { labels: [{ category: "gluten", label: "gluten" }], incomplete: false },
    });
  });

  it("dédoublonne le n:1 sans toucher aux codes", () => {
    expect(labelsOf(["UW", "NR"])).toMatchObject({
      allergens: ["UW", "NR"],
      allergenLabels: { labels: [{ category: "gluten", label: "gluten" }], incomplete: false },
    });
  });

  /**
   * `null` = aucune fiche réglementaire. Les mentions le suivent : rendre `[]`
   * ici ferait lire « aucun allergène » là où personne n'a rien déclaré, et
   * c'est la seule faute qui compte sur ce champ.
   */
  it("laisse les mentions à `null` quand aucune fiche n'est déclarée", () => {
    expect(labelsOf(null)).toMatchObject({ allergens: null, allergenLabels: null });
  });

  it("distingue « fiche sans allergène » de « pas de fiche »", () => {
    expect(labelsOf([])).toMatchObject({
      allergens: [],
      allergenLabels: { labels: [], incomplete: false },
    });
  });

  /**
   * Régression, transposée : côté plateforme, un code hors obligation UE
   * disparaissait de la projection **sans trace**, et l'écran affichait « Sans
   * allergène » sur un article déclarant la noix de coco (fix 2026-08-31). Le
   * fil porte donc `incomplete`, calculé là où le référentiel vit — le récepteur
   * ne saurait pas le recalculer.
   */
  it("avoue la liste amputée par un code hors obligation UE", () => {
    expect(labelsOf(["SO"])).toMatchObject({
      allergens: ["SO"],
      allergenLabels: { labels: [], incomplete: true },
    });
  });

  it("avoue l'amputation même quand la liste de mentions n'est pas vide", () => {
    expect(labelsOf(["UW", "SO"])?.allergenLabels).toEqual({
      labels: [{ category: "gluten", label: "gluten" }],
      incomplete: true,
    });
  });
});
