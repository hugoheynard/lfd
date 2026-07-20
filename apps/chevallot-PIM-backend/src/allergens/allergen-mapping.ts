// Domaine « allergènes » — modèle GS1 → INCO.
// Réf. : ADR-07 + documentation/chevallot/data-model/05-allergenes-gs1-inco.md.
//
// Stockage canonique = GS1 `AllergenTypeCode` (sur-ensemble international,
// interopérable GDSN/B2B). Projection vers l'INCO-14 (obligation UE 1169/2011)
// à l'affichage. On stocke le plus riche, on projette vers le bas.
//
// ⚠️ PROVISOIRE (galop d'essai). Les codes lettrés GS1 exacts DOIVENT être
// repris depuis la source officielle (ref.gs1.org/voc/AllergenTypeCode) au
// moment de l'implémentation. Les codes ci-dessous sont les EXEMPLES du doc de
// cadrage — ils figent la LOGIQUE (mapping n:1, filtrage, localisation), pas la
// table finale, qui deviendra une donnée de référence versionnée.

/** Code GS1 AllergenTypeCode (canonique). Provisoire — à peupler depuis GS1. */
export const GS1_ALLERGEN_CODES = [
  'AW', // blé      → INCO gluten
  'AR', // seigle   → INCO gluten   (démontre le n:1)
  'AP', // arachide → INCO peanuts
  'AE', // œuf      → INCO eggs
  'AC', // crustacés→ INCO crustaceans
  'AM', // lait     → INCO milk
  'AN', // noix     → INCO tree_nuts
  'BC', // noisette → INCO tree_nuts (démontre le n:1)
  'UN', // exemple sans obligation UE → aucune catégorie INCO
] as const;

export type AllergenCode = (typeof GS1_ALLERGEN_CODES)[number];

/** Catégorie INCO cible (sous-ensemble UE-14 utilisé pour le galop d'essai). */
export type IncoCategory =
  'gluten' | 'peanuts' | 'eggs' | 'crustaceans' | 'milk' | 'tree_nuts';

export type Lang = 'fr' | 'en';

export interface AllergenMapping {
  readonly gs1Code: AllergenCode;
  /** Catégorie INCO cible, ou `null` si aucune obligation UE. */
  readonly incoCategory: IncoCategory | null;
  /** Libellé GS1 granulaire, localisé. */
  readonly labels: Readonly<Record<Lang, string>>;
}

/** Donnée de référence, versionnée (ici en dur, provisoire). */
export const ALLERGEN_MAPPINGS: readonly AllergenMapping[] = [
  { gs1Code: 'AW', incoCategory: 'gluten', labels: { fr: 'Blé', en: 'Wheat' } },
  {
    gs1Code: 'AR',
    incoCategory: 'gluten',
    labels: { fr: 'Seigle', en: 'Rye' },
  },
  {
    gs1Code: 'AP',
    incoCategory: 'peanuts',
    labels: { fr: 'Arachide', en: 'Peanut' },
  },
  { gs1Code: 'AE', incoCategory: 'eggs', labels: { fr: 'Œuf', en: 'Egg' } },
  {
    gs1Code: 'AC',
    incoCategory: 'crustaceans',
    labels: { fr: 'Crustacés', en: 'Crustaceans' },
  },
  { gs1Code: 'AM', incoCategory: 'milk', labels: { fr: 'Lait', en: 'Milk' } },
  {
    gs1Code: 'AN',
    incoCategory: 'tree_nuts',
    labels: { fr: 'Noix', en: 'Walnut' },
  },
  {
    gs1Code: 'BC',
    incoCategory: 'tree_nuts',
    labels: { fr: 'Noisette', en: 'Hazelnut' },
  },
  {
    gs1Code: 'UN',
    incoCategory: null,
    labels: { fr: '(hors UE)', en: '(non-EU)' },
  },
];

/** Libellés de catégorie INCO, localisés (affichés en clair côté vitrine). */
const INCO_LABELS: Record<IncoCategory, Record<Lang, string>> = {
  gluten: {
    fr: 'Céréales contenant du gluten',
    en: 'Cereals containing gluten',
  },
  peanuts: { fr: 'Arachides', en: 'Peanuts' },
  eggs: { fr: 'Œufs', en: 'Eggs' },
  crustaceans: { fr: 'Crustacés', en: 'Crustaceans' },
  milk: { fr: 'Lait', en: 'Milk' },
  tree_nuts: { fr: 'Fruits à coque', en: 'Tree nuts' },
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
