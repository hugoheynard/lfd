import { formatCents } from '@lfd/b2b-ui/order';
import {
  STAFF_SUGGESTION_RESULT_PERIODS,
  type ComputedSuggestionResultKind,
  type StaffSuggestionResultPeriod,
  type StaffSuggestionResultRow,
} from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';

/** 7, 30 ou 90 jours — le libellé du sélecteur de période. */
export const RESULT_PERIOD_OPTIONS: readonly FoldViewToggleOption[] =
  STAFF_SUGGESTION_RESULT_PERIODS.map((days) => ({
    value: String(days),
    label: `${String(days)} jours`,
  }));

export function resultPeriodOf(value: string): StaffSuggestionResultPeriod | null {
  return STAFF_SUGGESTION_RESULT_PERIODS.find((days) => String(days) === value) ?? null;
}

/**
 * L'aide « estimé », dite telle qu'elle est calculée côté serveur
 * (`attributeOrders`, RS6) : les compteurs ne nomment personne.
 */
export const ESTIMATE_HELP =
  'Commandées et chiffre d’affaires sont estimés : la boutique compte les gestes sans savoir qui les fait, ' +
  'donc une commande ne se relie pas à un clic. Chaque jour, pour chaque article, on retient le plus petit ' +
  'de deux nombres : les ajouts au panier depuis la suggestion, et la quantité commandée ce jour-là ' +
  '(commandes de la boutique, hors annulées) ; si plusieurs suggestions ont fait ajouter le même article — ' +
  'règles de l’équipe comme suggestions calculées —, ce nombre se partage entre elles au prorata de leurs ' +
  'ajouts, pour qu’une pièce ne soit jamais comptée deux fois. Le chiffre d’affaires vaut cette quantité au prix HT moyen payé ' +
  'ce jour-là. Un panier commandé le lendemain ne compte pas.';

/** Le nom d'une ligne du calculé, sous les règles (RS6, Hugo, 2026-10-18). */
export const COMPUTED_RESULT_LABELS: Readonly<Record<ComputedSuggestionResultKind, string>> = {
  bought_with: 'Calculé : souvent pris avec',
  usuals: 'Calculé : vos habituels',
};

/** Ajoutées ÷ affichées, « 12,5 % » ; un tiret sans affichage. */
export function addRateLabel(row: Pick<StaffSuggestionResultRow, 'addRateBasisPoints'>): string {
  if (row.addRateBasisPoints === null) {
    return '—';
  }
  const BASIS_POINTS_PER_PERCENT = 100;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
    row.addRateBasisPoints / BASIS_POINTS_PER_PERCENT,
  )} %`;
}

/** Le chiffre d'affaires HT estimé, en euros comme ailleurs au back-office. */
export function revenueLabel(row: Pick<StaffSuggestionResultRow, 'revenueEstimateCents'>): string {
  return formatCents(row.revenueEstimateCents);
}
