import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type UpcomingClosureView,
} from '@lfd/contracts';

import { longDay } from './collection-month-wording';
import { day } from './invoice-dossier-format';

/**
 * Les mots du **rythme de facturation** d'une entité (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §6
 * et §12), lus par la carte de la fiche et par les écrans de prélèvement.
 *
 * Aucune date n'est calculée ici : les clôtures à venir, la prise d'effet et
 * le verrou arrivent du serveur. Ce fichier ne fait que les DIRE.
 */

/** Un mode et ses dates — la forme que la phrase et la comparaison lisent. */
export interface RhythmShape {
  readonly kind: BillingRhythmKind;
  readonly days: readonly number[];
}

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

/**
 * Le mode d'un client, tel que le choix à trois le dit (plan §16.9, M4b) : le
 * mensuel porte « par défaut », parce qu'un client qui n'a rien choisi l'est.
 */
export const PAYER_MODE_CHOICES: readonly {
  readonly value: BillingRhythmKind;
  readonly label: string;
}[] = [
  { value: 'monthly', label: `${BILLING_RHYTHM_KIND_LABELS.monthly} — par défaut` },
  { value: 'semimonthly', label: BILLING_RHYTHM_KIND_LABELS.semimonthly },
  { value: 'weekly', label: BILLING_RHYTHM_KIND_LABELS.weekly },
];

/** L'avertissement permanent « un seul changement à la fois » (§12), écrit une fois. */
export const ONE_CHANGE_AT_A_TIME =
  'Un seul changement à la fois : le nouveau réglage prend effet à la prochaine clôture ; ' +
  'le suivant ne sera possible qu’après.';

/** La ligne qui dit ce qu'est une date de clôture — la même sur les deux fiches. */
export const CLOSURE_TIME_SENTENCE =
  'La date est celle de la clôture, à 00h00 : la facture de la période part la veille à 23h55.';

/**
 * « 3 clients ont choisi ce mode ». Le mensuel ne compte pas ceux qui n'ont
 * rien choisi (décision de Hugo, plan §16.9-6) — la phrase le dit plutôt que
 * de laisser croire à un total.
 */
export function payersSentence(mode: BillingRhythmKind, count: number): string {
  const chosen =
    count === 0
      ? 'Aucun client n’a choisi ce mode'
      : `${String(count)} client${count > 1 ? 's ont' : ' a'} choisi ce mode`;
  return mode === 'monthly'
    ? `${chosen} ; les clients qui n’ont rien choisi sont aussi au mensuel, et ne sont pas comptés.`
    : `${chosen}.`;
}

/** « Prise d'effet à la clôture du 1er novembre 2026 » — la première clôture à venir. */
export function effectiveClosureSentence(closures: readonly UpcomingClosureView[]): string {
  const first = closures[0];
  return first === undefined
    ? 'à la prochaine clôture'
    : `à la clôture du ${longDay(first.closesAt)}`;
}

const ordinal = (day: number): string => (day === 1 ? '1er' : String(day));

/** « Chaque mois, clôture le 1er » ; « Chaque semaine, clôture le lundi ». */
export function rhythmSentence(rhythm: RhythmShape): string {
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
export function sameRhythm(a: RhythmShape, b: RhythmShape): boolean {
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
