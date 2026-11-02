import type { CatalogAdminItemView, MadeToOrderMarkView, ReservedVisibility } from '@lfd/contracts';

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

/**
 * L'étiquette d'un article **sur mesure** dans Catalogue publié (§ 13, D3 et
 * 13.6-7) : « Sur mesure · réservé à 2 comptes », « Sur mesure · à attribuer »,
 * et l'attente de validation pro quand il y en a une — un article sur mesure
 * n'est servi à un pro que validé ET attribué. `null` hors sur mesure.
 *
 * `mark` absent alors que les réservations sont lisibles = aucune réservation.
 * Sans le droit de les lire (`countsKnown` faux), on ne dit que le fait.
 */
export function customRecipeLabel(
  item: Pick<CatalogAdminItemView, 'isCustomRecipe' | 'proReviewPending'>,
  mark: MadeToOrderMarkView | undefined,
  countsKnown: boolean,
): string | null {
  if (!item.isCustomRecipe) {
    return null;
  }
  const parts = ['Sur mesure'];
  if (countsKnown) {
    parts.push(reservationCountLabel(mark) ?? 'à attribuer');
  }
  if (item.proReviewPending) {
    parts.push('validation pro en attente');
  }
  return parts.join(' · ');
}
