// Domaine « allergènes » — modèle GS1 → INCO.
// Réf. : ADR-07 + documentation/lfc/data-model/05-allergenes-gs1-inco.md.
//
// Stockage canonique = GS1 `AllergenTypeCode` (sur-ensemble international,
// interopérable GDSN/B2B). Projection vers l'INCO-14 (obligation UE 1169/2011)
// à l'affichage. On stocke le plus riche, on projette vers le bas.
//
// ⚠️⚠️ LES CODES GS1 SONT PROVISOIRES — TOUS.
// Les 14 CATÉGORIES INCO ci-dessous, elles, sont exactes : ce sont les
// allergènes à déclaration obligatoire de l'annexe II du règlement UE
// 1169/2011. Ce qui reste à corriger, ce sont les CODES, à reprendre depuis
// ref.gs1.org/voc/AllergenTypeCode. Les codes `TBD_` sont explicitement faux
// et repérables (`grep TBD_`) ; les codes lettrés viennent du doc de cadrage
// et n'ont pas été vérifiés non plus.
// → Ne rien exporter vers un canal réel (GDSN/B2B) avant remplacement.

export type Lang = "fr" | "en";

/** Les **14** catégories à déclaration obligatoire (UE 1169/2011, annexe II). */
export type IncoCategory =
  | "gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "peanuts"
  | "soybeans"
  | "milk"
  | "tree_nuts"
  | "celery"
  | "mustard"
  | "sesame"
  | "sulphites"
  | "lupin"
  | "molluscs";

export type AllergenCode = string;

export interface AllergenMapping {
  readonly gs1Code: AllergenCode;
  /** Catégorie INCO cible, ou `null` si aucune obligation UE. */
  readonly incoCategory: IncoCategory | null;
  /** Libellé GS1 granulaire, localisé. */
  readonly labels: Readonly<Record<Lang, string>>;
  /** `true` tant que le code n'a pas été repris de la source officielle GS1. */
  readonly provisional: boolean;
}

function entry(
  gs1Code: string,
  incoCategory: IncoCategory | null,
  fr: string,
  en: string,
): AllergenMapping {
  return { gs1Code, incoCategory, labels: { fr, en }, provisional: true };
}

/**
 * Donnée de référence, versionnée (ici en dur).
 *
 * Le mapping est **n:1** : plusieurs codes granulaires (blé, seigle, orge)
 * retombent sur une seule catégorie INCO (gluten). C'est la raison d'être du
 * modèle — l'étiquette affiche la catégorie, le B2B garde le détail.
 */
export const ALLERGEN_MAPPINGS: readonly AllergenMapping[] = [
  // Céréales contenant du gluten — n:1
  entry("AW", "gluten", "Blé", "Wheat"),
  entry("AR", "gluten", "Seigle", "Rye"),
  entry("TBD_BARLEY", "gluten", "Orge", "Barley"),
  entry("TBD_OATS", "gluten", "Avoine", "Oats"),
  entry("TBD_SPELT", "gluten", "Épeautre", "Spelt"),

  // Fruits à coque — n:1
  entry("AN", "tree_nuts", "Noix", "Walnut"),
  entry("BC", "tree_nuts", "Noisette", "Hazelnut"),
  entry("TBD_ALMOND", "tree_nuts", "Amande", "Almond"),
  entry("TBD_PISTACHIO", "tree_nuts", "Pistache", "Pistachio"),
  entry("TBD_CASHEW", "tree_nuts", "Noix de cajou", "Cashew"),
  entry("TBD_PECAN", "tree_nuts", "Noix de pécan", "Pecan"),

  // Une entrée par catégorie pour le reste
  entry("AE", "eggs", "Œuf", "Egg"),
  entry("AM", "milk", "Lait", "Milk"),
  entry("AP", "peanuts", "Arachide", "Peanut"),
  entry("AC", "crustaceans", "Crustacés", "Crustaceans"),
  entry("TBD_FISH", "fish", "Poisson", "Fish"),
  entry("TBD_SOY", "soybeans", "Soja", "Soybean"),
  entry("TBD_CELERY", "celery", "Céleri", "Celery"),
  entry("TBD_MUSTARD", "mustard", "Moutarde", "Mustard"),
  entry("TBD_SESAME", "sesame", "Sésame", "Sesame"),
  entry("TBD_SULPHITES", "sulphites", "Sulfites", "Sulphites"),
  entry("TBD_LUPIN", "lupin", "Lupin", "Lupin"),
  entry("TBD_MOLLUSCS", "molluscs", "Mollusques", "Molluscs"),

  // Hors obligation UE : visible au catalogue Monde, filtré à l'affichage INCO
  entry("UN", null, "(hors UE)", "(non-EU)"),
];

export const GS1_ALLERGEN_CODES: readonly string[] = ALLERGEN_MAPPINGS.map(
  (mapping) => mapping.gs1Code,
);

/**
 * Libellés **réglementaires** des catégories — ce sont eux qui doivent figurer
 * sur l'étiquette, pas le libellé granulaire.
 */
const INCO_LABELS: Record<IncoCategory, Record<Lang, string>> = {
  gluten: {
    fr: "Céréales contenant du gluten",
    en: "Cereals containing gluten",
  },
  crustaceans: { fr: "Crustacés", en: "Crustaceans" },
  eggs: { fr: "Œufs", en: "Eggs" },
  fish: { fr: "Poissons", en: "Fish" },
  peanuts: { fr: "Arachides", en: "Peanuts" },
  soybeans: { fr: "Soja", en: "Soybeans" },
  milk: { fr: "Lait", en: "Milk" },
  tree_nuts: { fr: "Fruits à coque", en: "Tree nuts" },
  celery: { fr: "Céleri", en: "Celery" },
  mustard: { fr: "Moutarde", en: "Mustard" },
  sesame: { fr: "Graines de sésame", en: "Sesame seeds" },
  sulphites: {
    fr: "Anhydride sulfureux et sulfites",
    en: "Sulphur dioxide and sulphites",
  },
  lupin: { fr: "Lupin", en: "Lupin" },
  molluscs: { fr: "Mollusques", en: "Molluscs" },
};

const BY_GS1 = new Map<string, AllergenMapping>(
  ALLERGEN_MAPPINGS.map((mapping) => [mapping.gs1Code, mapping]),
);

/** Résout un code GS1 (inconnu → `undefined`). */
export function findMapping(gs1Code: string): AllergenMapping | undefined {
  return BY_GS1.get(gs1Code);
}

/** Libellé localisé d'une catégorie INCO. */
export function incoLabel(category: IncoCategory, lang: Lang): string {
  return INCO_LABELS[category][lang];
}

/** Reste-t-il des codes non vérifiés ? Alimente le bandeau d'avertissement. */
export function hasProvisionalCodes(): boolean {
  return ALLERGEN_MAPPINGS.some((mapping) => mapping.provisional);
}
