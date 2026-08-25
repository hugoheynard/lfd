// Domaine « allergènes » — modèle GS1 → INCO.
//
// Stockage canonique = GS1 `AllergenTypeCode` (T4078), sur-ensemble
// international interopérable GDSN/B2B. Projection vers l'INCO-14 (obligation
// UE 1169/2011) à l'affichage. On stocke le plus riche, on projette vers le bas.
//
// ## Provenance des codes
//
// Chaque code ci-dessous a été relevé sur la liste T4078 publiée par GS1 et
// recoupé, un par un, avec le vocabulaire officiel `ref.gs1.org/voc/
// AllergenTypeCode`. Les deux sources concordent sur les 29 codes retenus.
//
// La version précédente portait des codes PROVISOIRES, et trois d'entre eux
// étaient faux — pas seulement incertains :
//   · `BC` y désignait « Noisette » ; GS1 l'attribue au CÉLERI (noisette = SH),
//   · `UN` y désignait « hors obligation UE » ; c'est SHELLFISH chez GS1,
//   · `AR` (« Seigle ») n'existe pas dans la liste (seigle = NR).
// Sur un champ réglementé, un code faux se déclare aussi bien qu'un bon et ne
// se voit qu'au contrôle. C'est la raison d'être du recoupement.
//
// ## Granularité : jamais la catégorie générique
//
// GS1 offre `AW` (« Cereals ») et `AN` (« Tree nuts ») ; ils ne sont PAS repris.
// L'annexe II du règlement 1169/2011 impose de nommer la céréale et le fruit à
// coque — « à savoir blé, seigle, orge, avoine », « à savoir amandes,
// noisettes, noix… ». Un code générique permettrait de déclarer « contient des
// fruits à coque » sans dire lesquels, c'est-à-dire de produire une étiquette
// non conforme depuis une saisie qui semble complète.
//
// `UN` (Shellfish) est écarté pour la raison inverse : il chevauche crustacés
// ET mollusques, donc aucune projection INCO ne peut être juste.

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
  /** Code GS1 `AllergenTypeCode` (T4078) — le stockage canonique. */
  readonly gs1Code: AllergenCode;
  /** Catégorie INCO cible, ou `null` si aucune obligation UE. */
  readonly incoCategory: IncoCategory | null;
  /** Libellé GS1 granulaire, localisé. */
  readonly labels: Readonly<Record<Lang, string>>;
}

function entry(
  gs1Code: string,
  incoCategory: IncoCategory | null,
  fr: string,
  en: string,
): AllergenMapping {
  return { gs1Code, incoCategory, labels: { fr, en } };
}

/**
 * Donnée de référence, versionnée (ici en dur).
 *
 * Le mapping est **n:1** : plusieurs codes granulaires (blé, seigle, orge)
 * retombent sur une seule catégorie INCO (gluten). C'est la raison d'être du
 * modèle — l'étiquette affiche la catégorie, le B2B garde le détail.
 */
export const ALLERGEN_MAPPINGS: readonly AllergenMapping[] = [
  // Céréales contenant du gluten — n:1. Épeautre et Khorasan sont des blés que
  // l'annexe II cite nommément ; ils ont leur propre code GS1.
  entry("UW", "gluten", "Blé", "Wheat"),
  entry("NR", "gluten", "Seigle", "Rye"),
  entry("GB", "gluten", "Orge", "Barley"),
  entry("GO", "gluten", "Avoine", "Oats"),
  entry("GS", "gluten", "Épeautre", "Spelt"),
  entry("GK", "gluten", "Blé de Khorasan (kamut)", "Khorasan wheat"),

  // Fruits à coque — n:1. Les huit que l'annexe II énumère, ni plus ni moins.
  entry("SA", "tree_nuts", "Amandes", "Almonds"),
  entry("SH", "tree_nuts", "Noisettes", "Hazelnuts"),
  entry("SW", "tree_nuts", "Noix", "Walnuts"),
  entry("SC", "tree_nuts", "Noix de cajou", "Cashews"),
  entry("SP", "tree_nuts", "Noix de pécan", "Pecan nuts"),
  entry("SR", "tree_nuts", "Noix du Brésil", "Brazil nuts"),
  entry("ST", "tree_nuts", "Pistaches", "Pistachios"),
  entry("SM", "tree_nuts", "Noix de macadamia", "Macadamia nuts"),

  // Une entrée par catégorie pour les douze autres : la catégorie EST la
  // substance, GS1 n'y offre rien de plus fin qui soit obligatoire.
  entry("AC", "crustaceans", "Crustacés", "Crustaceans"),
  entry("AE", "eggs", "Œufs", "Eggs"),
  entry("AF", "fish", "Poissons", "Fish"),
  entry("AP", "peanuts", "Arachides", "Peanuts"),
  entry("AY", "soybeans", "Soja", "Soybeans"),
  entry("AM", "milk", "Lait", "Milk"),
  entry("BC", "celery", "Céleri", "Celery"),
  entry("BM", "mustard", "Moutarde", "Mustard"),
  entry("AS", "sesame", "Graines de sésame", "Sesame seeds"),
  entry("AU", "sulphites", "Anhydride sulfureux et sulfites", "Sulphur dioxide and sulphites"),
  entry("NL", "lupin", "Lupin", "Lupine"),
  entry("UM", "molluscs", "Mollusques", "Molluscs"),

  // Hors obligation UE — visibles au catalogue « monde », filtrés à la
  // projection INCO. Les trois que la boulangerie rencontre vraiment : le
  // sarrasin est à déclaration obligatoire au Japon et en Corée, le maïs et la
  // noix de coco le sont sur plusieurs marchés hors UE.
  entry("BWD", null, "Sarrasin", "Buckwheat"),
  entry("NM", null, "Maïs", "Corn"),
  entry("SO", null, "Noix de coco", "Coconut"),
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
