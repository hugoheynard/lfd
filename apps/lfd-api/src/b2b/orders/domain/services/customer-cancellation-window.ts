import { localToInstant } from "@lfd/contracts";

/**
 * **Les deux refus du particulier, devant la règle staff** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.3) —
 * purs : pas d'horloge, l'instant est reçu (le `now` GELÉ de la requête, S5).
 *
 * - P1 — le réglage est fermé ;
 * - P2 — il reste moins de N heures avant l'**ancre**.
 *
 * Un pro n'a ni l'un ni l'autre (décision 2) : l'appelant ne lui applique pas
 * cette fonction.
 */

/** Le réglage tel que la décision le lit. */
export interface CustomerCancellationPolicy {
  readonly openToB2c: boolean;
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
  | { readonly kind: "closed" }
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
 * P1 puis P2. « Jusqu'à N heures avant » est INCLUSIF : une demande faite pile
 * à l'échéance passe.
 */
export function customerCancellationWindowOf(
  policy: CustomerCancellationPolicy,
  source: CancellationAnchorSource,
  now: Date,
): CustomerCancellationWindow {
  if (!policy.openToB2c) {
    return { kind: "closed" };
  }
  const anchor = cancellationAnchorOf(source);
  if (anchor === null) {
    return { kind: "too_late", until: null };
  }
  const until = new Date(anchor.getTime() - policy.hoursBefore * HOUR_MS);
  return now.getTime() <= until.getTime() ? { kind: "open", until } : { kind: "too_late", until };
}
