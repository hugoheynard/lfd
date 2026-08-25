import type { AllergenEntry, AllergenReference, AllergenScope } from "@lfd/pim-contracts";

import { ALLERGEN_MAPPINGS, incoLabel, type Lang } from "./allergen-mapping.js";

export type { AllergenEntry, AllergenReference, AllergenScope };

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
export function allergenReference(scope: AllergenScope, lang: Lang): AllergenReference {
  const entries: AllergenEntry[] = ALLERGEN_MAPPINGS.filter(
    (mapping) => scope === "world" || mapping.incoCategory !== null,
  ).map((mapping) => ({
    code: mapping.gs1Code,
    label: mapping.labels[lang],
    incoCategory: mapping.incoCategory,
    incoLabel: mapping.incoCategory === null ? null : incoLabel(mapping.incoCategory, lang),
  }));

  return { scope, entries };
}
