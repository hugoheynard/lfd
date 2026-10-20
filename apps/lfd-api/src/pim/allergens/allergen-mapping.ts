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
// AllergenTypeCode`. Les deux sources concordent sur les 30 codes retenus.
//
// (Le compte disait « 29 » jusqu'au 2026-08-31 : `AW` — triticale, justifié plus
// bas — avait été ajouté sans que la phrase suive. Un compte faux dans un
// commentaire de provenance se recopie ; celui-ci l'a été jusque dans un plan.)
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
// GS1 offre `AW` (« Cereals ») et `AN` (« Tree nuts »). L'annexe II du
// règlement 1169/2011 impose de nommer la céréale et le fruit à coque — « à
// savoir blé, seigle, orge, avoine », « à savoir amandes, noisettes, noix… ».
// Un code générique permettrait de déclarer « contient des fruits à coque »
// sans dire lesquels, c'est-à-dire de produire une étiquette non conforme
// depuis une saisie qui semble complète. `AN` est donc écarté.
//
// `AW` est repris pour un seul emploi, et sous un libellé qui le dit : les
// **souches hybridées** (triticale), que l'annexe II couvre et pour lesquelles
// GS1 n'offre rien d'autre — sa propre définition de `AW` les cite nommément.
// Ce n'est pas une échappatoire générique : l'écran propose « Triticale »,
// jamais « Céréales ».
//
// `UN` (Shellfish) est écarté pour la raison inverse : il chevauche crustacés
// ET mollusques, donc aucune projection INCO ne peut être juste.

export type Lang = "fr" | "en" | "it";

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

/** La 15ᵉ catégorie semée : officielle, hors annexe II (`inco_category` nul). */
export const NON_EU_CATEGORY = "non_eu";

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
  it: string,
): AllergenMapping {
  return { gs1Code, incoCategory, labels: { fr, en, it } };
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
  entry("UW", "gluten", "Blé", "Wheat", "Grano"),
  entry("NR", "gluten", "Seigle", "Rye", "Segale"),
  entry("GB", "gluten", "Orge", "Barley", "Orzo"),
  entry("GO", "gluten", "Avoine", "Oats", "Avena"),
  entry("GS", "gluten", "Épeautre", "Spelt", "Farro"),
  entry("GK", "gluten", "Blé de Khorasan (kamut)", "Khorasan wheat", "Grano khorasan"),
  // L'annexe II couvre aussi « leurs souches hybridées », dont le triticale, et
  // GS1 n'a pas de code dédié : sa définition de `AW` les cite nommément. On
  // reprend donc `AW`, mais sous le libellé de ce qu'il sert à déclarer ICI. Le
  // laisser s'appeler « Céréales » rouvrirait la porte que la sélection de
  // codes ferme — celle qui laisse déclarer du gluten sans dire lequel.
  entry(
    "AW",
    "gluten",
    "Triticale et autres souches hybridées",
    "Triticale and other hybrids",
    "Ceppi ibridati",
  ),

  // Fruits à coque — n:1. Les huit que l'annexe II énumère, ni plus ni moins.
  entry("SA", "tree_nuts", "Amandes", "Almonds", "Mandorle"),
  entry("SH", "tree_nuts", "Noisettes", "Hazelnuts", "Nocciole"),
  entry("SW", "tree_nuts", "Noix", "Walnuts", "Noci"),
  entry("SC", "tree_nuts", "Noix de cajou", "Cashews", "Noci di acagiù"),
  entry("SP", "tree_nuts", "Noix de pécan", "Pecan nuts", "Noci di pecan"),
  entry("SR", "tree_nuts", "Noix du Brésil", "Brazil nuts", "Noci del Brasile"),
  entry("ST", "tree_nuts", "Pistaches", "Pistachios", "Pistacchi"),
  entry("SM", "tree_nuts", "Noix de macadamia", "Macadamia nuts", "Noci macadamia"),

  // Une entrée par catégorie pour les douze autres : la catégorie EST la
  // substance, GS1 n'y offre rien de plus fin qui soit obligatoire.
  entry("AC", "crustaceans", "Crustacés", "Crustaceans", "Crostacei"),
  entry("AE", "eggs", "Œufs", "Eggs", "Uova"),
  entry("AF", "fish", "Poissons", "Fish", "Pesce"),
  entry("AP", "peanuts", "Arachides", "Peanuts", "Arachidi"),
  entry("AY", "soybeans", "Soja", "Soybeans", "Soia"),
  entry("AM", "milk", "Lait", "Milk", "Latte"),
  entry("BC", "celery", "Céleri", "Celery", "Sedano"),
  entry("BM", "mustard", "Moutarde", "Mustard", "Senape"),
  entry("AS", "sesame", "Graines de sésame", "Sesame seeds", "Semi di sesamo"),
  entry(
    "AU",
    "sulphites",
    "Anhydride sulfureux et sulfites",
    "Sulphur dioxide and sulphites",
    "Anidride solforosa e solfiti",
  ),
  entry("NL", "lupin", "Lupin", "Lupine", "Lupini"),
  entry("UM", "molluscs", "Mollusques", "Molluscs", "Molluschi"),

  // Hors obligation UE — visibles au catalogue « monde », filtrés à la
  // projection INCO. Les trois que la boulangerie rencontre vraiment : le
  // sarrasin est à déclaration obligatoire au Japon et en Corée, le maïs et la
  // noix de coco le sont sur plusieurs marchés hors UE.
  entry("BWD", null, "Sarrasin", "Buckwheat", "Grano saraceno"),
  entry("NM", null, "Maïs", "Corn", "Mais"),
  entry("SO", null, "Noix de coco", "Coconut", "Cocco"),
];

/**
 * Libellés **réglementaires** des catégories — ce sont eux qui doivent figurer
 * sur l'étiquette, pas le libellé granulaire. L'italien est recopié de
 * l'allegato II (EUR-Lex, CELEX:02011R1169-20180101), validé par Hugo le
 * 2026-10-20 ; seul `non_eu`, hors annexe, est traduit.
 *
 * `non_eu` y figure parce que la base la sème officielle et verrouillée : cet
 * oracle rejoue les 15 catégories de la migration, pas seulement les 14 de
 * l'annexe.
 */
const INCO_LABELS: Record<IncoCategory | typeof NON_EU_CATEGORY, Record<Lang, string>> = {
  gluten: {
    fr: "Céréales contenant du gluten",
    en: "Cereals containing gluten",
    it: "Cereali contenenti glutine",
  },
  crustaceans: { fr: "Crustacés", en: "Crustaceans", it: "Crostacei" },
  eggs: { fr: "Œufs", en: "Eggs", it: "Uova" },
  fish: { fr: "Poissons", en: "Fish", it: "Pesce" },
  peanuts: { fr: "Arachides", en: "Peanuts", it: "Arachidi" },
  soybeans: { fr: "Soja", en: "Soybeans", it: "Soia" },
  milk: { fr: "Lait", en: "Milk", it: "Latte" },
  tree_nuts: { fr: "Fruits à coque", en: "Tree nuts", it: "Frutta a guscio" },
  celery: { fr: "Céleri", en: "Celery", it: "Sedano" },
  mustard: { fr: "Moutarde", en: "Mustard", it: "Senape" },
  sesame: { fr: "Graines de sésame", en: "Sesame seeds", it: "Semi di sesamo" },
  sulphites: {
    fr: "Anhydride sulfureux et sulfites",
    en: "Sulphur dioxide and sulphites",
    it: "Anidride solforosa e solfiti",
  },
  lupin: { fr: "Lupin", en: "Lupin", it: "Lupini" },
  molluscs: { fr: "Mollusques", en: "Molluscs", it: "Molluschi" },
  non_eu: { fr: "Hors obligation UE", en: "Not EU-declarable", it: "Fuori obbligo UE" },
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

/** Libellé localisé de la catégorie hors obligation UE. */
export function nonEuLabel(lang: Lang): string {
  return INCO_LABELS[NON_EU_CATEGORY][lang];
}
