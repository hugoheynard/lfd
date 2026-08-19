import type { AllergenCode, IncoCategory, Lang } from "./allergen-mapping.js";
import { findMapping, incoLabel } from "./allergen-mapping.js";

export class UnknownAllergenCodeError extends Error {
  constructor(public readonly gs1Code: string) {
    super(`Code allergène GS1 inconnu : "${gs1Code}"`);
    this.name = "UnknownAllergenCodeError";
  }
}

/** Allergène projeté pour l'affichage réglementaire UE (INCO). */
export interface IncoAllergen {
  readonly category: IncoCategory;
  readonly label: string;
  /** L'INCO impose de mettre l'allergène en évidence dans la liste (gras). */
  readonly emphasize: true;
}

/**
 * Projette des codes GS1 (stockage canonique) vers l'INCO pour la vitrine.
 * Fait les 3 opérations de l'adaptateur INCO : **filtre** (jette les codes sans
 * obligation UE), **dédup n:1** (n codes GS1 → 1 catégorie INCO), **localise**
 * (+ marque la mise en forme). Un code GS1 inconnu est une erreur métier.
 */
export function toInco(codes: readonly string[], lang: Lang): IncoAllergen[] {
  const byCategory = new Map<IncoCategory, IncoAllergen>();
  for (const code of codes) {
    const mapping = findMapping(code);
    if (mapping === undefined) {
      throw new UnknownAllergenCodeError(code);
    }
    if (mapping.incoCategory === null) {
      continue; // pas d'obligation INCO → filtré
    }
    if (!byCategory.has(mapping.incoCategory)) {
      byCategory.set(mapping.incoCategory, {
        category: mapping.incoCategory,
        label: incoLabel(mapping.incoCategory, lang),
        emphasize: true,
      });
    }
  }
  return [...byCategory.values()];
}

/**
 * Export GDSN / B2B : pass-through des codes GS1 canoniques (aucune perte).
 * Valide au passage que chaque code est connu du référentiel.
 */
export function toGdsn(codes: readonly string[]): AllergenCode[] {
  return codes.map((code) => {
    const mapping = findMapping(code);
    if (mapping === undefined) {
      throw new UnknownAllergenCodeError(code);
    }
    return mapping.gs1Code;
  });
}
