import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type BillingRhythmView,
  type UpcomingClosureView,
} from '@lfd/contracts';

import { day } from './invoice-dossier-format';

/**
 * Les mots du **rythme de facturation** d'une entité (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §6
 * et §12), lus par la carte de la fiche et par les écrans de prélèvement.
 *
 * Aucune date n'est calculée ici : les clôtures à venir, la prise d'effet et
 * le verrou arrivent du serveur. Ce fichier ne fait que les DIRE.
 */

/** Le jour de semaine du contrat : 1 = lundi … 7 = dimanche. */
export const WEEKDAY_LABELS: Readonly<Record<number, string>> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
};

/** Le dernier jour du mois admis : au-delà, février n'aurait pas de clôture. */
export const LAST_CLOSING_DAY_OF_MONTH = 28;

/** Une période plus courte que ce nombre de jours se signale (§6, bascule). */
export const SHORT_PERIOD_DAYS = 3;

const MS_PER_DAY = 86_400_000;

/** Le genre, tel que le choix à trois le dit — « Chaque mois » plutôt que « Mensuel ». */
export const RHYTHM_KIND_CHOICES: readonly {
  readonly value: BillingRhythmKind;
  readonly label: string;
}[] = [
  { value: 'monthly', label: 'Chaque mois' },
  { value: 'semimonthly', label: BILLING_RHYTHM_KIND_LABELS.semimonthly },
  { value: 'weekly', label: BILLING_RHYTHM_KIND_LABELS.weekly },
];

/** Les jours par défaut quand on change de genre : 1er ; 1er et 16 ; lundi. */
export function defaultDays(kind: BillingRhythmKind): readonly number[] {
  switch (kind) {
    case 'monthly':
      return [1];
    case 'semimonthly':
      return [1, 16];
    case 'weekly':
      return [1];
  }
}

const ordinal = (day: number): string => (day === 1 ? '1er' : String(day));

/** « Chaque mois, clôture le 1er » ; « Chaque semaine, clôture le lundi ». */
export function rhythmSentence(rhythm: BillingRhythmView): string {
  switch (rhythm.kind) {
    case 'monthly':
      return `Chaque mois, clôture le ${ordinal(rhythm.days[0] ?? 1)}`;
    case 'semimonthly':
      return `Deux fois par mois, clôtures le ${rhythm.days.map(ordinal).join(' et le ')}`;
    case 'weekly':
      return `Chaque semaine, clôture le ${WEEKDAY_LABELS[rhythm.days[0] ?? 1] ?? ''}`;
  }
}

/** Les deux rythmes disent-ils la même chose ? Alors « enregistrer » n'aurait rien à faire. */
export function sameRhythm(a: BillingRhythmView, b: BillingRhythmView): boolean {
  return (
    a.kind === b.kind && a.days.length === b.days.length && a.days.every((d, i) => d === b.days[i])
  );
}

/**
 * Ce qui manque à la saisie pour être un rythme, ou `null`. La FORME
 * seulement : le serveur reste juge, et son refus s'affiche tel quel.
 */
export function rhythmDraftProblem(
  kind: BillingRhythmKind,
  days: readonly (number | null)[],
): string | null {
  if (days.some((day) => day === null)) {
    return 'Renseignez le jour de clôture.';
  }
  if (kind === 'weekly') {
    return null;
  }
  if (days.some((day) => day !== null && (day < 1 || day > LAST_CLOSING_DAY_OF_MONTH))) {
    return `Un jour de clôture va du 1er au ${String(LAST_CLOSING_DAY_OF_MONTH)} : février n’en a pas d’autre.`;
  }
  if (kind === 'semimonthly' && days[0] === days[1]) {
    return 'Les deux jours de clôture doivent être différents.';
  }
  return null;
}

/** « Période du 1er au 31 octobre 2026 — facturée le 31 oct. 2026 ». */
export function closureLine(closure: UpcomingClosureView): string {
  return `Période ${closure.periodLabel} — facturée le ${day(closure.invoicedOn)}`;
}

/**
 * La première période sous le rythme programmé, quand elle est si courte
 * qu'elle surprendrait : elle commence à la prise d'effet et finit à la
 * première clôture qui la suit. `null` sinon.
 */
export function shortPeriodWarning(
  effectiveAtIso: string,
  closures: readonly UpcomingClosureView[],
): string | null {
  const effectiveAt = new Date(effectiveAtIso).getTime();
  const first = closures.find((closure) => new Date(closure.closesAt).getTime() > effectiveAt);
  if (first === undefined) {
    return null;
  }
  const days = Math.round((new Date(first.closesAt).getTime() - effectiveAt) / MS_PER_DAY);
  if (days >= SHORT_PERIOD_DAYS) {
    return null;
  }
  const length = days <= 1 ? 'qu’un seul jour' : `que ${String(days)} jours`;
  return (
    `La première période du nouveau rythme ne dure ${length} (${first.periodLabel}) : ` +
    'elle aura sa propre facture.'
  );
}
