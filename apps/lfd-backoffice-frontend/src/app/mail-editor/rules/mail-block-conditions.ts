import type { MailEditorResources, MailPreviewSituation, ModelSectionId } from '@lfd/mail-blocks';

/**
 * Le mot du badge d'un bloc qui ne s'affiche pas toujours (plan
 * `plan-editeur-par-blocs.md`, § 24, conditions d'affichage). Générique : la
 * condition est une phrase libre du serveur, et en tirer un résumé serait
 * deviner ; la phrase entière accompagne le badge.
 */
export const CONDITION_BADGE = 'Sous condition';

/** Les situations de l'aperçu, dites à l'écran. */
export const SITUATION_LABELS: Readonly<Record<MailPreviewSituation, string>> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

const SITUATION_ARTICLES: Readonly<Record<MailPreviewSituation, string>> = {
  pickup: 'un retrait',
  delivery: 'une livraison',
};

/** Les conditions des blocs de données, par bloc du modèle ; un bloc sans condition n'y est pas. */
export function conditionsByBlock(
  resources: MailEditorResources,
): ReadonlyMap<ModelSectionId, string> {
  const conditions = new Map<ModelSectionId, string>();
  for (const data of resources.dataBlocks) {
    if (data.condition !== undefined && data.condition !== '') {
      conditions.set(data.block, data.condition);
    }
  }
  return conditions;
}

/** « Absent pour une livraison » : ce que dit un bloc que la situation rendue écarte. */
export function absenceLabel(situation: MailPreviewSituation): string {
  return `Absent pour ${SITUATION_ARTICLES[situation]}`;
}
