import { addDays, instantToLocal } from '@lfd/contracts';

/**
 * **Au-delà de six heures, on ne compte pas.** « Plus que 8 h » à 15 h pour
 * une limite à 23 h presse sans raison ; « commandez avant 23 h » dit la même
 * chose calmement (Hugo, 2026-10-21).
 */
export const COUNTDOWN_THRESHOLD_MINUTES = 6 * 60;

const MINUTE_MS = 60_000;

/** Ce que la boutique sait du jour de service au moment où elle parle. */
export interface DayNoticeInput {
  /** L'instant présent — fourni, jamais lu ici. */
  readonly now: Date;
  /** Le jour gardé par le choix du client, `AAAA-MM-JJ`. */
  readonly held: string;
  /** Le premier jour que le serveur accorde, ou `null` s'il n'en dit rien. */
  readonly first: string | null;
  /** La limite annoncée de ce premier jour (ISO), ou `null` : aucune. */
  readonly firstOrderUntil: string | null;
  /** La limite de DEMAIN, si on l'a lue avant qu'elle tombe — sinon `null`. */
  readonly tomorrowOrderUntil: string | null;
  /** Les jours sont bornés par une opération datée que porte le panier. */
  readonly byOperation: boolean;
}

/**
 * Ce que la barre et le panier disent du jour de service. `null` = rien à
 * dire : la barre nomme déjà le jour retenu.
 */
export type DayNotice =
  /** Le jour gardé n'est plus demandable : la limite est passée pendant la saisie. */
  | { readonly kind: 'slipped'; readonly held: string; readonly first: string }
  /** Le panier porte une opération : c'est elle qui repousse le jour, pas la limite. */
  | { readonly kind: 'operation'; readonly first: string }
  /** Demain est VRAIMENT refusé : le premier jour accordé est postérieur. */
  | { readonly kind: 'late'; readonly held: string; readonly passedAt: Date | null }
  /** La limite du premier jour tombe aujourd'hui, dans moins de six heures. */
  | { readonly kind: 'countdown'; readonly first: string; readonly minutesLeft: number }
  /** La limite du premier jour tombe aujourd'hui, plus tard. */
  | { readonly kind: 'calm'; readonly first: string; readonly until: Date }
  | null;

/**
 * **Quoi dire du jour de service** — fonction pure, horloge injectée.
 *
 * 🔴 Régression du 2026-10-21 (démo de Hugo) : la boutique disait « Trop tard
 * pour demain » dès que le jour GARDÉ (localStorage) était postérieur à demain
 * — un jour choisi plus tôt, ou celui d'une opération —, alors que le serveur
 * accordait demain. « Trop tard » ne se dit plus que quand le PREMIER jour
 * accordé est postérieur à demain ; avant, on prévient.
 */
export function decideDayNotice(input: DayNoticeInput): DayNotice {
  const { first, held } = input;
  if (first === null) {
    return null;
  }
  // Des jours `AAAA-MM-JJ` se comparent comme des chaînes.
  if (held < first) {
    return { kind: 'slipped', held, first };
  }
  const tomorrow = addDays(instantToLocal(input.now).day, 1);
  if (first > tomorrow) {
    return input.byOperation
      ? { kind: 'operation', first }
      : { kind: 'late', held, passedAt: passedLimit(input.tomorrowOrderUntil, input.now) };
  }
  return deadlineNotice(first, input.firstOrderUntil, input.now);
}

/** La limite de demain, seulement si elle est bien passée. */
function passedLimit(iso: string | null, now: Date): Date | null {
  const at = iso === null ? null : new Date(iso);
  return at !== null && !Number.isNaN(at.getTime()) && at.getTime() < now.getTime() ? at : null;
}

/** Prévenir avant : seulement quand la limite tombe AUJOURD'HUI et n'est pas passée. */
function deadlineNotice(first: string, orderUntil: string | null, now: Date): DayNotice {
  const until = orderUntil === null ? null : new Date(orderUntil);
  if (until === null || Number.isNaN(until.getTime())) {
    return null;
  }
  const left = until.getTime() - now.getTime();
  if (left <= 0 || instantToLocal(until).day !== instantToLocal(now).day) {
    return null;
  }
  const minutesLeft = Math.max(1, Math.floor(left / MINUTE_MS));
  return minutesLeft > COUNTDOWN_THRESHOLD_MINUTES
    ? { kind: 'calm', first, until }
    : { kind: 'countdown', first, minutesLeft };
}

/**
 * Vrai quand une limite connue est tombée : la réponse du serveur ne vaut
 * plus, il faut relire `/fulfillment-days`.
 */
export function limitHasPassed(orderUntil: string | null, now: Date): boolean {
  return passedLimit(orderUntil, now) !== null;
}
