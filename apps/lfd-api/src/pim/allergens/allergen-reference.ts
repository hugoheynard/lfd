import { ALLERGEN_MAPPINGS, incoLabel, type Lang } from "./allergen-mapping.js";

/**
 * Deux **catalogues**, une seule donnée.
 *
 * - `eu` (défaut) — seulement ce qui porte une obligation de déclaration UE.
 *   C'est ce qu'un boulanger de Val d'Isère doit renseigner.
 * - `world` — tout le référentiel GS1, y compris les codes sans obligation UE.
 *   Utile en B2B/GDSN, où l'interlocuteur peut être hors UE.
 *
 * Ce n'est pas un filtre d'affichage anodin : le catalogue `eu` est la liste
 * **légale**, le catalogue `world` est la liste **interopérable**.
 */
export type AllergenScope = "eu" | "world";

export interface AllergenReferenceEntry {
  /** Code de stockage canonique. */
  readonly code: string;
  /** Libellé granulaire — « Noisette ». */
  readonly label: string;
  /** Catégorie réglementaire, `null` hors obligation UE. */
  readonly incoCategory: string | null;
  /** Libellé **d'étiquette** — « Fruits à coque ». C'est lui qui fait foi. */
  readonly incoLabel: string | null;
}

export interface AllergenReference {
  readonly scope: AllergenScope;
  readonly entries: readonly AllergenReferenceEntry[];
}

export function allergenReference(scope: AllergenScope, lang: Lang): AllergenReference {
  const entries = ALLERGEN_MAPPINGS.filter(
    (mapping) => scope === "world" || mapping.incoCategory !== null,
  ).map((mapping) => ({
    code: mapping.gs1Code,
    label: mapping.labels[lang],
    incoCategory: mapping.incoCategory,
    incoLabel: mapping.incoCategory === null ? null : incoLabel(mapping.incoCategory, lang),
  }));

  return { scope, entries };
}
