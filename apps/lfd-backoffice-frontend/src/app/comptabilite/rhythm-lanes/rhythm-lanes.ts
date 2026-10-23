import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldBadgeComponent } from 'fold-ng';
import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type BillingRhythmsCalendarView,
} from '@lfd/contracts';

const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;

/** Les trois jalons d'une période, dans l'ordre où ils arrivent. */
export type RhythmMarkKind = 'closure' | 'notice' | 'collection';

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

/** Une barre : un rythme, ses marques et ses phrases. */
export interface RhythmLane {
  readonly mode: BillingRhythmKind;
  readonly title: string;
  readonly followed: boolean;
  readonly followers: string;
  readonly marks: readonly RhythmMark[];
  /** Le prochain prélèvement, en clair — `null` si aucun ne tombe d'ici la fin de l'axe. */
  readonly next: string | null;
  readonly lines: readonly RhythmPeriodLine[];
}

/** La légende, une fois : la forme de chaque marque ET son nom. */
export const RHYTHM_MARK_LEGEND: readonly {
  readonly kind: RhythmMarkKind;
  readonly label: string;
}[] = [
  { kind: 'closure', label: 'Clôture — factures émises la veille à 23h55' },
  { kind: 'notice', label: 'Avis de prélèvement (pré-notification)' },
  { kind: 'collection', label: 'Prélèvement — échéance' },
];

/**
 * **Les trois rythmes de prélèvement sur un même axe** — hebdomadaire, deux
 * fois par mois, mensuel, chacun avec ses clôtures, ses avis et ses échéances.
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
 * Trois formes (trait, rond, losange), une légende qui les nomme, un survol
 * qui date chaque marque, et sous chaque barre la liste des périodes en
 * toutes lettres pour qui ne voit pas la piste.
 */
@Component({
  selector: 'app-rhythm-lanes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent],
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
          {
            key: `${period.closesAt}-collection`,
            kind: 'collection' as const,
            percent: this.percentOf(period.collectionDay, 0.5),
            label: `Prélèvement le ${longDay(period.collectionDay)}`,
          },
        ].filter((mark) => mark.percent >= 0 && mark.percent <= 100),
      ),
      next: nextCollectionOf(
        lane.periods.map((period) => period.collectionDay),
        this.calendar().today,
      ),
      lines: lane.periods.map((period) => ({
        key: period.closesAt,
        text:
          `Clôture le ${longDay(addDays(period.invoicedOn, 1))}, ` +
          `avis le ${longDay(period.noticeOn)}, ` +
          `prélèvement le ${longDay(period.collectionDay)}.`,
      })),
    })),
  );

  /** Un jour de l'axe en pourcentage ; `within` situe l'instant dans la journée. */
  private percentOf(day: string, within: number): number {
    return ((daysBetween(this.calendar().startsOn, day) + within) / this.span()) * 100;
  }
}

function nextCollectionOf(days: readonly string[], today: string): string | null {
  const next = days.find((day) => day >= today);
  return next === undefined ? null : `Prochain prélèvement : ${longDay(next)}`;
}

function followersOf(mode: BillingRhythmKind, followed: boolean, count: number): string {
  if (mode === 'monthly') {
    return count > 0
      ? `Par défaut, et choisi par ${String(count)} client${count > 1 ? 's' : ''}`
      : 'Par défaut';
  }
  if (!followed) {
    return 'Aucun client';
  }
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
