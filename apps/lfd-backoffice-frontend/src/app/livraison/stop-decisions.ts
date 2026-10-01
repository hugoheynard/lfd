import type { FoldBadgeVariant } from 'fold-ng';
import type { StopDecisionView } from '@lfd/contracts';

import { parisTimeOf } from './delivery-loading';

/**
 * **La décision du commercial, en mots** (`documentation/livraisons/plan-a-la-porte.md`,
 * B3) — pour la carte du livreur et pour la liste « À décider ».
 */

/** Le badge de la carte du livreur. */
export interface DecisionBadge {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/**
 * « En attente du commercial », « Autorisé : déposer », « Rapporté » — ou
 * `null` : aucun signalement n'a ouvert de décision.
 */
export function decisionBadgeOf(decision: StopDecisionView | null): DecisionBadge | null {
  if (decision === null) {
    return null;
  }
  switch (decision.state) {
    case 'pending':
      return { label: 'En attente du commercial', variant: 'warning' };
    case 'authorize_deposit':
      return { label: 'Autorisé : déposer', variant: 'success' };
    case 'bring_back':
      return { label: 'Rapporté', variant: 'neutral' };
  }
}

/** « À décider », ou « Dépôt autorisé à 9 h 12 par Léa Martin ». */
export function decisionStatusOf(decision: StopDecisionView): string {
  if (decision.state === 'pending' || decision.decidedAt === null) {
    return 'À décider';
  }
  const by = decision.decidedByName === null ? '' : ` par ${decision.decidedByName}`;
  const what = decision.state === 'authorize_deposit' ? 'Dépôt autorisé' : 'Rapporté';
  return `${what} à ${parisTimeOf(decision.decidedAt)}${by}`;
}
