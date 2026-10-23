import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldBadgeComponent } from 'fold-ng';
import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type BillingRhythmPeriodView,
  type BillingRhythmsCalendarView,
} from '@lfd/contracts';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const PROCEDURE_ROUTE = '/comptabilite/procedure-de-prelevement';
const ENTITY_ROUTE = '/comptabilite/entites-juridiques';

/** Les quatre jalons d'une période, dans l'ordre où ils arrivent. */
export type RhythmMarkKind = 'closure' | 'notice' | 'deposit' | 'collection';

/** Un jalon posé sur l'axe. */
export interface RhythmMark {
  readonly key: string;
  readonly kind: RhythmMarkKind;
  readonly percent: number;
  /** Ce que dit le survol : le jalon et sa date, en toutes lettres. */
  readonly label: string;
}

/** Une période dite en une phrase — ce qu'un lecteur d'écran lit à la place des marques. */
export interface RhythmPeriodLine {
  readonly key: string;
  readonly text: string;
}

/**
 * La prochaine procédure d'un rythme : ses jalons en une phrase, et où l'ouvrir
 * — la procédure de sa clôture, sur son lot s'il est constitué.
 */
export interface RhythmNextProcedure {
  readonly text: string;
  /** Le détail de la procédure de cette clôture (entité × clôture). */
  readonly procedureLink: string;
  /** Son lot, s'il est constitué — le détail le suit. */
  readonly procedureQuery: { readonly lot?: string };
  /** Le lien vers les réglages de l'entité, quand la limite de dépôt n'y est pas réglée. */
  readonly settingsLink: string | null;
}

/** Une barre : un rythme, ses marques et ses phrases. */
export interface RhythmLane {
  readonly mode: BillingRhythmKind;
  readonly title: string;
  readonly followed: boolean;
  readonly followers: string;
  readonly marks: readonly RhythmMark[];
  /** La prochaine procédure, en clair — `null` si aucun prélèvement ne tombe d'ici la fin de l'axe. */
  readonly next: RhythmNextProcedure | null;
  readonly lines: readonly RhythmPeriodLine[];
}

/** La légende, une fois : la forme de chaque marque ET son nom. */
export const RHYTHM_MARK_LEGEND: readonly {
  readonly kind: RhythmMarkKind;
  readonly label: string;
}[] = [
  { kind: 'closure', label: 'Clôture — factures émises la veille à 23h55' },
  { kind: 'notice', label: 'Avis de prélèvement (pré-notification)' },
  { kind: 'deposit', label: 'Limite de dépôt du fichier à la banque' },
  { kind: 'collection', label: 'Prélèvement — échéance' },
];

/**
 * **Les trois rythmes de prélèvement sur un même axe** — hebdomadaire, deux
 * fois par mois, mensuel, chacun avec ses clôtures, ses avis, ses limites de
 * dépôt et ses échéances.
 *
 * ## Rien n'est calculé ici
 *
 * Les dates arrivent du serveur (`GET …/billing-modes/calendar`), qui les tire
 * du calendrier du lot — suite des clôtures de chaque mode, délai de
 * pré-notification et report TARGET2 de l'entité. L'écran ne fait que les
 * POSER : un jour devient un pourcentage de l'axe, rien de plus. Un second
 * calcul de l'échéance ici dirait tôt ou tard une autre date que le fichier.
 *
 * ## Une marque n'est jamais seulement une couleur
 *
 * Quatre formes (trait, rond, carré creux, losange), une légende qui les nomme, un survol
 * qui date chaque marque, et sous chaque barre la liste des périodes en
 * toutes lettres pour qui ne voit pas la piste.
 */
@Component({
  selector: 'app-rhythm-lanes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, RouterLink],
  templateUrl: './rhythm-lanes.html',
  styleUrl: './rhythm-lanes.scss',
})
export class RhythmLanes {
  readonly calendar = input.required<BillingRhythmsCalendarView>();

  protected readonly legend = RHYTHM_MARK_LEGEND;

  private readonly span = computed(() =>
    Math.max(1, daysBetween(this.calendar().startsOn, this.calendar().endsOn)),
  );

  /** L'axe en clair — « du 5 oct. au 15 nov. 2026 », le dernier jour INCLUS. */
  protected readonly axisLabel = computed(() => {
    const { startsOn, endsOn } = this.calendar();
    return `Du ${shortDay(startsOn)} au ${longDay(addDays(endsOn, -1))}`;
  });

  protected readonly noticeSentence = computed(
    () =>
      `Délai de pré-notification réglé sur l’entité : ${String(this.calendar().preNotificationDays)} jours.`,
  );

  /** Aujourd'hui, au milieu de sa journée. */
  protected readonly todayPercent = computed(() => this.percentOf(this.calendar().today, 0.5));

  protected readonly todayLabel = computed(() => `Aujourd’hui, ${longDay(this.calendar().today)}`);

  /** Les lundis de l'axe, sauf le premier qui en est le bord. */
  protected readonly weeks = computed(() => {
    const { startsOn } = this.calendar();
    const weeks: { readonly day: string; readonly percent: number; readonly label: string }[] = [];
    for (let offset = DAYS_PER_WEEK; offset < this.span(); offset += DAYS_PER_WEEK) {
      const monday = addDays(startsOn, offset);
      weeks.push({ day: monday, percent: (offset / this.span()) * 100, label: shortDay(monday) });
    }
    return weeks;
  });

  protected readonly lanes = computed<readonly RhythmLane[]>(() =>
    this.calendar().rhythms.map((lane) => ({
      mode: lane.mode,
      title: BILLING_RHYTHM_KIND_LABELS[lane.mode],
      followed: lane.followed,
      followers: followersOf(lane.mode, lane.followed, lane.payerCount),
      marks: lane.periods.flatMap((period) =>
        [
          {
            key: `${period.closesAt}-closure`,
            kind: 'closure' as const,
            // La clôture est le minuit qui ouvre son jour : le bord gauche du jour.
            percent: this.percentOf(addDays(period.invoicedOn, 1), 0),
            label: `Clôture le ${longDay(addDays(period.invoicedOn, 1))} à 00h00 — factures du ${longDay(period.invoicedOn)}`,
          },
          {
            key: `${period.closesAt}-notice`,
            kind: 'notice' as const,
            percent: this.percentOf(period.noticeOn, 0.5),
            label: `Avis de prélèvement le ${longDay(period.noticeOn)}`,
          },
          ...this.depositMarks(period),
          {
            key: `${period.closesAt}-collection`,
            kind: 'collection' as const,
            percent: this.percentOf(period.collectionDay, 0.5),
            label: `Prélèvement le ${longDay(period.collectionDay)}`,
          },
        ].filter((mark) => mark.percent >= 0 && mark.percent <= 100),
      ),
      next: nextProcedureOf(lane.periods, this.calendar()),
      lines: lane.periods.map((period) => ({
        key: period.closesAt,
        text:
          `Clôture le ${longDay(addDays(period.invoicedOn, 1))}, ` +
          `avis le ${longDay(period.noticeOn)}, ` +
          depositClauseOf(period) +
          `prélèvement le ${longDay(period.collectionDay)}.`,
      })),
    })),
  );

  /** Le dépôt, entre l'avis et le prélèvement — à son heure dans la journée. */
  private depositMarks(period: BillingRhythmPeriodView): readonly RhythmMark[] {
    const deadline = period.depositDeadline;
    if (deadline === null) {
      return [];
    }
    return [
      {
        key: `${period.closesAt}-deposit`,
        kind: 'deposit',
        percent: this.percentOf(deadline.day, minutesOf(deadline.time) / MINUTES_PER_DAY),
        label: `Dépôt avant le ${longDay(deadline.day)} à ${hourOf(deadline.time)}`,
      },
    ];
  }

  /** Un jour de l'axe en pourcentage ; `within` situe l'instant dans la journée. */
  private percentOf(day: string, within: number): number {
    return ((daysBetween(this.calendar().startsOn, day) + within) / this.span()) * 100;
  }
}

function nextProcedureOf(
  periods: readonly BillingRhythmPeriodView[],
  calendar: BillingRhythmsCalendarView,
): RhythmNextProcedure | null {
  const next = periods.find((period) => period.collectionDay >= calendar.today);
  if (next === undefined) {
    return null;
  }
  const deposit =
    next.depositDeadline === null
      ? 'limite de dépôt non réglée'
      : `dépôt avant ${longDay(next.depositDeadline.day)} ${hourOf(next.depositDeadline.time)}`;
  const entite = calendar.legalEntityId;
  return {
    text:
      `Prochaine procédure : clôture ${longDay(addDays(next.invoicedOn, 1))} · ` +
      `${deposit} · prélèvement ${longDay(next.collectionDay)}`,
    procedureLink: `${PROCEDURE_ROUTE}/${next.procedureId}`,
    procedureQuery: next.batchId === null ? {} : { lot: next.batchId },
    settingsLink: next.depositDeadline === null ? `${ENTITY_ROUTE}/${entite}` : null,
  };
}

/** « 16:00 » → minutes depuis minuit. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

/** « 16:00 » → « 16h00 », la graphie des autres libellés. */
function hourOf(time: string): string {
  return time.replace(':', 'h');
}

function followersOf(mode: BillingRhythmKind, followed: boolean, count: number): string {
  if (mode === 'monthly') {
    return `Par défaut · ${clientsOf(count)}`;
  }
  return followed ? clientsOf(count) : 'Aucun client';
}

/** « 0 client », « 1 client », « 3 clients ». */
function clientsOf(count: number): string {
  return `${String(count)} client${count > 1 ? 's' : ''}`;
}

/** Jours de calendrier entre deux `AAAA-MM-JJ` — arithmétique de dates, sans fuseau. */
function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / MS_PER_DAY);
}

function addDays(day: string, days: number): string {
  return new Date(utcOf(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function utcOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1);
}

/** « 16 nov. » — la graduation. */
function shortDay(day: string): string {
  return new Date(utcOf(day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** « 16 novembre 2026 » — ce qu'on lit et ce qu'on entend. */
function longDay(day: string): string {
  return new Date(utcOf(day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** « dépôt avant le 13 octobre 2026 à 16h00, » — rien si la limite n'est pas réglée. */
function depositClauseOf(period: BillingRhythmPeriodView): string {
  const deadline = period.depositDeadline;
  return deadline === null
    ? ''
    : `dépôt avant le ${longDay(deadline.day)} à ${hourOf(deadline.time)}, `;
}
