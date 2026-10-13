// Valeurs par le sous-chemin sans zod (budget `cloudflare`).
import {
  CUSTOMER_CANCEL_CODE_PREFIX,
  type CustomerCancellationRefusal,
  type OrderCancellability,
} from '@lfd/contracts/shop-values';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import type { OrderCancelCopy } from '../copy/screens/order-cancel.copy';
import { formatCents } from '../format-money';
import { SHOP_TIME_ZONE } from '../shop-time-zone';

/** La branche « annulable » du contrat. */
export type CancellableState = Extract<OrderCancellability, { cancellable: true }>;

/** La branche « refusée » du contrat. */
export type RefusedState = Extract<OrderCancellability, { cancellable: false }>;

/**
 * Ce que rend une annulation demandée : faite, refusée avec un code (connu ou
 * non) et la phrase du serveur, ou introuvable (`404` — hors mur, lien faux).
 */
export type CancelOutcome =
  | { readonly kind: 'done' }
  | {
      readonly kind: 'refused';
      /** Le code d'erreur entier (`orders.customer_cancel.too_late`), ou `null`. */
      readonly errorCode: string | null;
      readonly message: string;
    }
  | { readonly kind: 'not_found' };

/** Le motif choisi, tel qu'il part dans le corps du `POST`. */
export interface CancelReason {
  readonly reasonCode?: string;
  readonly reasonText?: string;
}

/**
 * L'échéance « 14/10 à 09:00 », lue à Paris — jamais dans le fuseau du
 * navigateur : le délai est celui de la boutique.
 */
export function untilLabel(iso: string, locale: LocaleCode, copy: OrderCancelCopy): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return iso;
  }
  const day = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    timeZone: SHOP_TIME_ZONE,
  }).format(instant);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: SHOP_TIME_ZONE,
  }).format(instant);
  return fill(copy.when, { day, time });
}

/** Ce qui arrivera à l'argent, en une phrase (C6.8). */
export function moneySentence(state: CancellableState, copy: OrderCancelCopy): string {
  switch (state.money.kind) {
    case 'nothing_charged':
      return copy.moneyNothing;
    case 'refund':
      return fill(copy.moneyRefund, { amount: formatCents(state.money.amountCents) });
    case 'account':
      return copy.moneyAccount;
  }
}

/**
 * Pourquoi la commande ne s'annule pas, dit d'après le CODE. `until` ne sert
 * qu'au « trop tard » ; sans échéance, la phrase perd sa date plutôt que
 * d'afficher un jeton brut.
 */
export function refusalSentence(
  code: CustomerCancellationRefusal,
  until: string | null,
  locale: LocaleCode,
  copy: OrderCancelCopy,
): string {
  const sentence = copy.refusals[code];
  if (code !== 'too_late') {
    return sentence;
  }
  return until === null
    ? copy.tooLateUndated
    : fill(sentence, { when: untilLabel(until, locale, copy) });
}

/**
 * Le refus d'un `409`, dit pour l'écran : la phrase du code quand on le connaît,
 * sinon celle du serveur, sinon le repli.
 */
export function outcomeSentence(
  outcome: Extract<CancelOutcome, { kind: 'refused' }>,
  until: string | null,
  locale: LocaleCode,
  copy: OrderCancelCopy,
): string {
  const code = refusalOf(outcome.errorCode, copy);
  if (code !== null) {
    return refusalSentence(code, until, locale, copy);
  }
  return outcome.message === '' ? copy.refusedFallback : outcome.message;
}

/**
 * `orders.customer_cancel.too_late` → `too_late` ; un code étranger → `null`.
 * Les codes connus sont ceux que le dictionnaire sait dire : son `Record` est
 * exhaustif sur le type du contrat.
 */
export function refusalOf(
  errorCode: string | null,
  copy: OrderCancelCopy,
): CustomerCancellationRefusal | null {
  if (errorCode === null || !errorCode.startsWith(CUSTOMER_CANCEL_CODE_PREFIX)) {
    return null;
  }
  const suffix = errorCode.slice(CUSTOMER_CANCEL_CODE_PREFIX.length);
  return isRefusal(suffix, copy) ? suffix : null;
}

function isRefusal(code: string, copy: OrderCancelCopy): code is CustomerCancellationRefusal {
  return Object.hasOwn(copy.refusals, code);
}

/** Le lien d'annulation de l'invité, lu dans le fragment `#<orderId>.<jeton>` (S7). */
export interface GuestLink {
  readonly orderId: string;
  readonly token: string;
}

/** `null` pour un fragment absent ou mal formé — la page dit alors « lien introuvable ». */
export function parseGuestFragment(fragment: string | null): GuestLink | null {
  const raw = (fragment ?? '').replace(/^#/u, '');
  const dot = raw.indexOf('.');
  if (dot <= 0 || dot === raw.length - 1) {
    return null;
  }
  return { orderId: raw.slice(0, dot), token: raw.slice(dot + 1) };
}
