import { localToInstant } from "@lfd/contracts";

/**
 * **Le délai du particulier, devant la règle staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.3) —
 * pur : pas d'horloge, l'instant est reçu (le `now` GELÉ de la requête, S5).
 *
 * P2 — il reste moins de N heures avant l'**ancre**. Il n'y a plus de P1
 * (« réglage fermé ») depuis la décision de Hugo du 2026-10-13 : le compte à
 * produire est la limite dans tous les cas, le délai ne fait que l'avancer.
 *
 * Un pro n'a pas de délai (décision 2), un particulier n'en a que si le
 * réglage l'impose : l'appelant ne leur applique alors pas cette fonction.
 */

/** Le réglage tel que la décision le lit. */
export interface CustomerCancellationPolicy {
  /** `true` : un délai est imposé aux particuliers (colonne `open_to_b2c`). */
  readonly delayEnabled: boolean;
  readonly hoursBefore: number;
}

/** Ce que la commande dit du moment où on la retire ou la livre. */
export interface CancellationAnchorSource {
  /** `AAAA-MM-JJ`, ou `null` : commande d'avant la date obligatoire. */
  readonly serviceDay: string | null;
  /** `HH:mm` du début du créneau figé, ou `null` (« avant HH:mm », ou aucun créneau). */
  readonly windowStart: string | null;
}

export type CustomerCancellationWindow =
  | { readonly kind: "open"; readonly until: Date }
  /** `until` : l'échéance passée ; `null` quand la commande n'a pas de date. */
  | { readonly kind: "too_late"; readonly until: Date | null };

const HOUR_MS = 3_600_000;
const MIDNIGHT = "00:00";

/**
 * **L'ancre** : le jour de service à l'heure de début du créneau, en heure de
 * Paris. Sans début — ou à une heure qui n'existe pas (passage à l'heure
 * d'été) — minuit local du jour : la borne la plus tôt, donc la plus prudente
 * (Q-C6.4). `null` sans jour.
 */
export function cancellationAnchorOf(source: CancellationAnchorSource): Date | null {
  if (source.serviceDay === null) {
    return null;
  }
  const atStart =
    source.windowStart === null ? null : localToInstant(source.serviceDay, source.windowStart);
  return atStart ?? localToInstant(source.serviceDay, MIDNIGHT);
}

/**
 * **L'instant limite** : N heures avant l'ancre. `null` sans jour. La même
 * fonction fige l'instant à la passation (`Order.fixCustomerCancellationDeadline`)
 * et juge une commande d'avant la colonne au réglage du jour : la règle n'est
 * écrite qu'ici.
 */
export function customerCancellationDeadlineOf(
  hoursBefore: number,
  source: CancellationAnchorSource,
): Date | null {
  const anchor = cancellationAnchorOf(source);
  return anchor === null ? null : new Date(anchor.getTime() - hoursBefore * HOUR_MS);
}

/**
 * P2 contre un instant limite déjà connu — figé à la passation, ou calculé.
 * « Jusqu'à » est INCLUSIF : une demande faite pile à l'échéance passe.
 */
export function customerCancellationWindowAt(
  until: Date | null,
  now: Date,
): CustomerCancellationWindow {
  if (until === null) {
    return { kind: "too_late", until: null };
  }
  return now.getTime() <= until.getTime() ? { kind: "open", until } : { kind: "too_late", until };
}

/**
 * P2 au réglage du jour — le calcul des commandes passées avant que l'instant
 * soit figé. Ne lit que le délai : savoir s'il est imposé est l'affaire de
 * l'appelant.
 */
export function customerCancellationWindowOf(
  hoursBefore: number,
  source: CancellationAnchorSource,
  now: Date,
): CustomerCancellationWindow {
  return customerCancellationWindowAt(customerCancellationDeadlineOf(hoursBefore, source), now);
}
