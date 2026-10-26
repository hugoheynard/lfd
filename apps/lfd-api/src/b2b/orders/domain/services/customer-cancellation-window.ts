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

/**
 * **Ce que la commande a figé du délai à sa passation** (Hugo, 2026-10-26 —
 * doc `annulation-par-le-client.md`, « Le délai figé »). Le délai LUI-MÊME,
 * pas seulement l'instant : une révision du jour ou du créneau recalcule
 * l'instant avec le délai d'origine, jamais avec le réglage du jour.
 *
 * - `not_fixed` : commande de société, saisie de l'équipe, ou commande
 *   d'avant les colonnes — le réglage du jour juge (un pro n'a de toute façon
 *   pas de délai) ;
 * - `no_delay` : particulier passé quand le réglage n'imposait aucun délai —
 *   seul l'arrêt du plan le limite, comme un pro, quel que soit le réglage du
 *   jour ;
 * - `delay` : particulier passé sous un délai de `hoursBefore` heures.
 */
export type FixedCustomerCancellation =
  | { readonly kind: "not_fixed" }
  | { readonly kind: "no_delay" }
  | { readonly kind: "delay"; readonly hoursBefore: number };

export const NOT_FIXED_CANCELLATION: FixedCustomerCancellation = { kind: "not_fixed" };

/** Le délai que la passation d'un particulier fige, lu sur le réglage du moment. */
export function fixedCancellationOf(policy: CustomerCancellationPolicy): FixedCustomerCancellation {
  return policy.delayEnabled
    ? { kind: "delay", hoursBefore: policy.hoursBefore }
    : { kind: "no_delay" };
}

/**
 * Le délai figé tel qu'il fait foi, y compris pour les commandes passées entre
 * le 2026-10-26 (instant seul, `cc30f4f20`) et l'ajout du délai : leur délai
 * se relit sur l'écart entre l'ancre et l'instant, à l'heure près, borné à
 * zéro. Exact tant que le jour et le créneau n'avaient pas bougé — la
 * révision ne recalculait pas encore l'instant.
 */
export function effectiveFixedCancellation(
  fixed: FixedCustomerCancellation,
  frozenUntil: Date | null,
  source: CancellationAnchorSource,
): FixedCustomerCancellation {
  if (fixed.kind !== "not_fixed" || frozenUntil === null) {
    return fixed;
  }
  const anchor = cancellationAnchorOf(source);
  const hours =
    anchor === null ? 0 : Math.round((anchor.getTime() - frozenUntil.getTime()) / HOUR_MS);
  return { kind: "delay", hoursBefore: Math.max(0, hours) };
}

/** L'instant limite d'un délai figé ; `null` sans délai figé ou sans jour. */
export function fixedCancellationDeadlineOf(
  fixed: FixedCustomerCancellation,
  source: CancellationAnchorSource,
): Date | null {
  return fixed.kind === "delay" ? customerCancellationDeadlineOf(fixed.hoursBefore, source) : null;
}
