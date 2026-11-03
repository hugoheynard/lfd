import type { AdminOrderEstimateNotice, StaffSettlement } from '@lfd/contracts';

import { isBlockingRefusal, refusalViewOf } from './order-estimate';

/** La vue visible du panier de droite. */
export type PanierView = 'settings' | 'lines';

/** Un refus, et la vue où se corrige ce qu'il nomme — `null` si on ne sait pas. */
export interface PanierBlocker {
  readonly text: string;
  readonly view: PanierView | null;
}

/** Ce que la colonne sait au moment de juger si la commande peut partir. */
export interface PanierBlockerFacts {
  readonly empty: boolean;
  readonly hasBuyer: boolean;
  readonly requestedDate: string;
  readonly fulfillmentIssue: string | null;
  /** Ce que la vitrine ne couvre pas — `null` hors du retrait immédiat. */
  readonly shelfIssue: string | null;
  readonly settlement: StaffSettlement;
  readonly linkOffered: boolean;
  readonly settlesOnAccount: boolean;
  readonly refusal: AdminOrderEstimateNotice | null;
}

/**
 * **Ce qui empêche de valider**, dit en clair et rattaché à la vue qui le
 * corrige. Une liste et non un booléen : un bouton grisé sans raison oblige à
 * deviner ce qui manque.
 */
export function panierBlockersOf(facts: PanierBlockerFacts): readonly PanierBlocker[] {
  const issues: PanierBlocker[] = [];
  if (facts.empty) {
    issues.push({ text: 'Le panier est vide.', view: 'lines' });
  }
  if (!facts.hasBuyer) {
    issues.push({
      text: "Ce compte n'a aucun interlocuteur avec un accès : la commande n'a personne à qui être portée.",
      view: 'settings',
    });
  }
  if (facts.requestedDate === '') {
    issues.push({
      text: "Aucun jour de retrait/livraison : la commande n'entrerait dans aucune journée de production.",
      view: 'settings',
    });
  }
  if (facts.fulfillmentIssue !== null) {
    issues.push({ text: facts.fulfillmentIssue, view: 'settings' });
  }
  if (facts.shelfIssue !== null) {
    issues.push({ text: facts.shelfIssue, view: 'lines' });
  }
  issues.push(...settlementBlockers(facts));
  if (facts.refusal !== null && isBlockingRefusal(facts.refusal)) {
    issues.push({ text: facts.refusal.message, view: refusalViewOf(facts.refusal.code) });
  }
  return issues;
}

/** Les refus du règlement : un mode qui n'est pas proposé, ou un compte fermé. */
function settlementBlockers(facts: PanierBlockerFacts): readonly PanierBlocker[] {
  if (facts.settlement === 'link' && !facts.linkOffered) {
    return [
      {
        text: 'Le lien de règlement n’est pas proposé au comptoir : la commande part au compte.',
        view: 'settings',
      },
    ];
  }
  if (facts.settlement === 'account' && !facts.settlesOnAccount) {
    return [
      {
        text: 'Cette société ne règle pas au compte — aucun crédit ne lui a été accordé.',
        view: 'settings',
      },
    ];
  }
  return [];
}
