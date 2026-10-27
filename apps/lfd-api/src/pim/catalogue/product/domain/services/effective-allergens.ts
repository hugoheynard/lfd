import type { VariantAllergenSheetSnapshot } from "../entities/variant.js";

/**
 * **Ce qu'une déclinaison SERT comme allergènes** — l'état que le client lit,
 * jamais la déclaration enregistrée (qui n'est pas réécrite).
 */
export interface EffectiveAllergens {
  /** Les allergènes servis : la déclaration dans son ordre, puis les cités qu'elle n'a pas. */
  readonly allergens: readonly string[];
  /** Les traces servies (« peut contenir »), sans aucun allergène servi. */
  readonly mayContain: readonly string[];
  /**
   * Servie par précaution (règle B) : personne ne s'est prononcé, les traces
   * sont celles de tout le catalogue publié.
   */
  readonly precautionary: boolean;
}

/**
 * **L'UNIQUE application des deux règles** de
 * `documentation/pim/plan-allergenes-jamais-bloquants.md` (2026-10-27) —
 * l'activation, la projection vers le commerce et la fiche la lisent toutes.
 *
 * - **A** — ce que la composition cite est déclaré : les codes cités entrent
 *   dans les allergènes et sortent des traces. Jamais de retrait.
 * - **B** — sans déclaration (`sheet === null`), allergènes = cités, traces =
 *   `catalogueUnion` (les allergènes déclarés des déclinaisons publiées) moins
 *   les allergènes servis. « Aucun allergène » (`[]`) est une déclaration et ne
 *   déclenche pas B.
 *
 * Pure : la déclaration enregistrée n'est jamais modifiée, c'est l'état SERVI
 * qui applique les règles.
 */
export function effectiveAllergens(
  sheet: VariantAllergenSheetSnapshot | null,
  cited: readonly string[],
  catalogueUnion: readonly string[],
): EffectiveAllergens {
  const declared = sheet?.declared ?? [];
  const allergens = unique([...declared, ...cited]);
  const traces = sheet === null ? catalogueUnion : sheet.mayContain;
  return {
    allergens,
    mayContain: unique(traces.filter((code) => !allergens.includes(code))),
    precautionary: sheet === null,
  };
}

/**
 * Ce que la règle A ajoute à une déclaration ENREGISTRÉE — la fiche le
 * montre. Vide sans déclaration : sous B, rien n'est « ajouté » à un silence.
 */
export function citedNotDeclared(
  sheet: VariantAllergenSheetSnapshot | null,
  cited: readonly string[],
): string[] {
  if (sheet === null) {
    return [];
  }
  const served = effectiveAllergens(sheet, cited, []).allergens;
  return served.filter((code) => !sheet.declared.includes(code));
}

/** Sans doublon, dans l'ordre d'arrivée : l'ordre déclaré est celui de l'étiquette. */
function unique(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}
