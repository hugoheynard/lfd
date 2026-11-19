import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent } from 'fold-ng';
import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type BillingRhythmPeriodView,
  type BillingRhythmsCalendarView,
} from '@lfd/contracts';

import { isPooled, pooledTitle } from '../procedure-de-prelevement/procedure-wording';
import { DEPOSIT_CUTOFF_ANCHOR } from '../deposit-cutoff-anchor';
import { addDays, daysBetween, longDay, monthTitle, shiftMonth, shortDay } from './rhythm-days';

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
  /** Une clôture que d'autres rythmes partagent ce jour-là — un seul lot (2026-10-23). */
  readonly pooled?: boolean;
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
 * dépôt et ses échéances, sur UN mois calendaire : deux flèches passent au
 * mois voisin, que la page redemande au serveur.
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
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldButtonIconComponent, RouterLink],
  templateUrl: './rhythm-lanes.html',
  styleUrl: './rhythm-lanes.scss',
})
export class RhythmLanes {
  readonly calendar = input.required<BillingRhythmsCalendarView>();
  /** Le mois (`AAAA-MM`) que l'on demande à voir — la page le relit au serveur. */
  readonly monthChange = output<string>();

  protected readonly legend = RHYTHM_MARK_LEGEND;
  protected readonly depositAnchor = DEPOSIT_CUTOFF_ANCHOR;

  private readonly span = computed(() =>
    Math.max(1, daysBetween(this.calendar().startsOn, this.calendar().endsOn)),
  );

  /** Le mois montré, « Novembre 2026 ». */
  protected readonly axisLabel = computed(() => monthTitle(this.calendar().month));

  /** Le mois montré n'est pas celui d'aujourd'hui : « Ce mois-ci » y ramène. */
  protected readonly awayFromToday = computed(
    () => this.calendar().month !== this.calendar().today.slice(0, 'AAAA-MM'.length),
  );

  /** Aujourd'hui tombe-t-il sur l'axe ? Sinon, pas de trait. */
  protected readonly todayShown = computed(() => {
    const { today, startsOn, endsOn } = this.calendar();
    return today >= startsOn && today < endsOn;
  });

  protected readonly noticeSentence = computed(
    () =>
      `Délai de pré-notification réglé sur l’entité : ${String(this.calendar().preNotificationDays)} jours.`,
  );

  /** Aujourd'hui, au milieu de sa journée. */
  protected readonly todayPercent = computed(() => this.percentOf(this.calendar().today, 0.5));

  protected readonly todayLabel = computed(() => `Aujourd’hui, ${longDay(this.calendar().today)}`);

  /** La graduation : le 8, le 15, le 22, le 29 — le 1er est le bord de l'axe. */
  protected readonly weeks = computed(() => {
    const { startsOn } = this.calendar();
    const weeks: { readonly day: string; readonly percent: number; readonly label: string }[] = [];
    for (let offset = DAYS_PER_WEEK; offset < this.span(); offset += DAYS_PER_WEEK) {
      const day = addDays(startsOn, offset);
      weeks.push({ day, percent: (offset / this.span()) * 100, label: shortDay(day) });
    }
    return weeks;
  });

  /** Le mois voisin, ou celui d'aujourd'hui. */
  protected previous(): void {
    this.monthChange.emit(shiftMonth(this.calendar().month, -1));
  }

  protected next(): void {
    this.monthChange.emit(shiftMonth(this.calendar().month, 1));
  }

  protected backToToday(): void {
    this.monthChange.emit(this.calendar().today.slice(0, 'AAAA-MM'.length));
  }

  protected readonly lanes = computed<readonly RhythmLane[]>(() =>
    this.calendar().rhythms.map((lane) => ({
      mode: lane.mode,
      title: BILLING_RHYTHM_KIND_LABELS[lane.mode],
      followed: lane.followed,
      followers: followersOf(lane.mode, lane.followed, lane.payerCount),
      marks: lane.periods.flatMap((period) =>
        [
          this.closureMark(period),
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
          `${period.procedureCode} — clôture le ${longDay(addDays(period.invoicedOn, 1))}${pooledClause(period)}, ` +
          `avis le ${longDay(period.noticeOn)}, ` +
          depositClauseOf(period) +
          `prélèvement le ${longDay(period.collectionDay)}.`,
      })),
    })),
  );

  /**
   * La clôture est le minuit qui ouvre son jour : le bord gauche du jour.
   * Mutualisée, elle le dit au survol et porte un repère (`data-pooled`).
   */
  private closureMark(period: BillingRhythmPeriodView): RhythmMark {
    const day = addDays(period.invoicedOn, 1);
    return {
      key: `${period.closesAt}-closure`,
      kind: 'closure',
      percent: this.percentOf(day, 0),
      label: `${period.procedureCode} — clôture le ${longDay(day)} à 00h00 — factures du ${longDay(period.invoicedOn)}${pooledClause(period)}`,
      pooled: isPooled(period.closureModes),
    };
  }

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
      `Prochaine procédure ${next.procedureCode} : clôture ${longDay(addDays(next.invoicedOn, 1))} · ` +
      `${deposit} · prélèvement ${longDay(next.collectionDay)}`,
    procedureLink: `${PROCEDURE_ROUTE}/${next.procedureId}`,
    procedureQuery: next.batchId === null ? {} : { lot: next.batchId },
    settingsLink: next.depositDeadline === null ? `${ENTITY_ROUTE}/${entite}` : null,
  };
}

/** « — mutualisée : hebdomadaire + mensuel : une seule clôture, un seul lot » ; rien sinon. */
function pooledClause(period: BillingRhythmPeriodView): string {
  return isPooled(period.closureModes) ? ` — mutualisée : ${pooledTitle(period.closureModes)}` : '';
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

/** « dépôt avant le 13 octobre 2026 à 16h00, » — rien si la limite n'est pas réglée. */
function depositClauseOf(period: BillingRhythmPeriodView): string {
  const deadline = period.depositDeadline;
  return deadline === null
    ? ''
    : `dépôt avant le ${longDay(deadline.day)} à ${hourOf(deadline.time)}, `;
}
