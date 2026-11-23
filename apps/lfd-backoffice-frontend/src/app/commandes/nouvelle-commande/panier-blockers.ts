import {
  ORDER_OFFER_NOTE_MAX_LENGTH,
  type AdminOrderEstimateNotice,
  type OrderOfferNature,
  type StaffSettlement,
} from '@lfd/contracts';

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
  /** Le droit d'offrir (`b2b_offer_order:write`) — absent, `offered` ne part pas. */
  readonly canOffer?: boolean;
  /** Le motif d'une commande offerte, tel que saisi — lu en `offered` seulement. */
  readonly offerNature?: OrderOfferNature | null;
  readonly offerNote?: string;
  /** Un organisme public : au compte, toujours ; le serveur dit le refus. */
  readonly payerIsPublic?: boolean;
  /** Ce qui manque à l'engagement budgétaire d'un organisme public (`budgetCommitmentGaps`). */
  readonly commitmentGaps?: readonly string[];
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
  for (const gap of facts.commitmentGaps ?? []) {
    issues.push({ text: gap, view: 'settings' });
  }
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
  if (facts.settlement === 'offered') {
    return offerBlockers(facts);
  }
  if (facts.payerIsPublic === true) {
    // Un organisme public part au compte, toujours. Son compte suspendu, c'est
    // le refus de l'estimation qui le dit, tel que le serveur l'écrit
    // (`orders.settlement.public_buyer_account_unavailable`) : « aucun crédit
    // accordé » serait faux, et la carte n'est pas une sortie.
    return [];
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

/**
 * Les refus d'une commande offerte : le droit d'offrir, puis le motif — une
 * nature et un texte court, que la passation exige et que la comptabilité
 * relira pour dire pourquoi on a offert.
 */
function offerBlockers(facts: PanierBlockerFacts): readonly PanierBlocker[] {
  if (facts.canOffer !== true) {
    return [
      {
        text: 'Offrir une commande demande un droit que vous n’avez pas : choisissez un autre règlement.',
        view: 'settings',
      },
    ];
  }
  return offerReasonIssues(facts.offerNature ?? null, facts.offerNote ?? '').map((text) => ({
    text,
    view: 'settings',
  }));
}

/**
 * Ce qui manque au motif d'une commande offerte : une nature, et un texte
 * court non vide. Partagé avec la saisie d'un particulier, qui offre par sa
 * propre route : les mêmes mots, quelle que soit la porte.
 */
export function offerReasonIssues(
  nature: OrderOfferNature | null,
  note: string,
): readonly string[] {
  const issues: string[] = [];
  if (nature === null) {
    issues.push('Une commande offerte dit pourquoi : choisissez sa nature.');
  }
  const text = note.trim();
  if (text === '') {
    issues.push('Une commande offerte porte un motif : écrivez-le en quelques mots.');
  } else if (text.length > ORDER_OFFER_NOTE_MAX_LENGTH) {
    issues.push(`Le motif de l’offre dépasse ${String(ORDER_OFFER_NOTE_MAX_LENGTH)} caractères.`);
  }
  return issues;
}
