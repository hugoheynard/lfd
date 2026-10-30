import type { MadeToOrderMarkView, ReservedVisibility } from '@lfd/contracts';

/**
 * Les mots du sur mesure, partagés par l'article (catalogue publié) et la
 * fiche client (plan `plan-articles-sur-mesure.md`, § 7).
 */

/** Ce que voient les autres professionnels d'un article réservé. */
export const RESERVED_VISIBILITY_LABELS: Readonly<Record<ReservedVisibility, string>> = {
  hidden: 'Invisible aux autres pros',
  visible_locked: 'Visible, non commandable',
};

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** « 30 octobre 2026 » — le jour d'une réservation, à l'heure de Paris du poste. */
export function reservationDate(iso: string): string {
  return DAY.format(new Date(iso));
}

/** « réservé à 1 compte », « réservé à 3 comptes » — `null` sans réservation. */
export function reservationCountLabel(mark: MadeToOrderMarkView | undefined): string | null {
  const count = mark?.reservationCount ?? 0;
  if (count === 0) {
    return null;
  }
  return `réservé à ${String(count)} compte${count > 1 ? 's' : ''}`;
}
