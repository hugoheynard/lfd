import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { addDays } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

/** Une case du mois : un jour, ou un blanc avant le premier. */
interface MonthCell {
  readonly day: string | null;
  readonly label: string;
  readonly served: boolean;
}

/** Un an au plus quand le serveur ne borne pas la fin. */
const MONTHS_AHEAD_WITHOUT_END = 12;

/**
 * **Un calendrier mensuel navigable** (Hugo, 2026-10-27 : « un calendrier
 * plutôt qu'un field ») : le mois, ses flèches, une grille lundi → dimanche.
 * Seuls les jours que `served` accepte sont cliquables. Applicatif parce que
 * `fold-calendar-month` n'a ni jour sélectionnable ni jour désactivable
 * (lu dans `fold-ng.d.ts` le 2026-10-27).
 *
 * Dates en `AAAA-MM-JJ`, calculées à midi UTC : aucun fuseau ne change le jour.
 */
@Component({
  selector: 'app-month-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './month-picker.html',
  styleUrl: './month-picker.scss',
})
export class MonthPicker {
  /** Le premier jour possible : le mois de départ, et la borne basse. */
  readonly min = input.required<string>();
  /** Le dernier jour possible, ou `null` : alors un an au plus. */
  readonly max = input<string | null>(null);
  readonly served = input.required<(day: string) => boolean>();
  readonly locale = input.required<string>();
  readonly previousLabel = input.required<string>();
  readonly nextLabel = input.required<string>();

  readonly picked = output<string>();

  /** Le mois affiché, en décalage depuis le mois de `min`. */
  protected readonly offset = signal(0);

  private readonly firstOfMonth = computed(() => {
    const [year, month] = this.min().split('-').map(Number);
    return Date.UTC(year ?? 1970, (month ?? 1) - 1 + this.offset(), 1, 12);
  });

  private readonly lastOffset = computed(() => {
    const end = this.max();
    if (end === null) {
      return MONTHS_AHEAD_WITHOUT_END;
    }
    const [y0, m0] = this.min().split('-').map(Number);
    const [y1, m1] = end.split('-').map(Number);
    return ((y1 ?? 0) - (y0 ?? 0)) * 12 + ((m1 ?? 0) - (m0 ?? 0));
  });

  protected readonly canPrevious = computed(() => this.offset() > 0);
  protected readonly canNext = computed(() => this.offset() < this.lastOffset());

  protected readonly title = computed(() =>
    new Intl.DateTimeFormat(this.locale(), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(this.firstOfMonth()),
  );

  /** Les initiales des jours, lundi d'abord, dans la langue du lecteur. */
  protected readonly weekdays = computed(() => {
    const format = new Intl.DateTimeFormat(this.locale(), { weekday: 'narrow', timeZone: 'UTC' });
    // Le 5 janvier 2026 est un lundi.
    return Array.from({ length: 7 }, (_unused, i) => format.format(Date.UTC(2026, 0, 5 + i, 12)));
  });

  protected readonly cells = computed<readonly MonthCell[]>(() => {
    const first = new Date(this.firstOfMonth());
    const leading = (first.getUTCDay() + 6) % 7;
    const start = first.toISOString().slice(0, 10);
    const month = first.getUTCMonth();
    const accept = this.served();
    const days: MonthCell[] = [];
    for (let i = 0; i < 31; i++) {
      const day = addDays(start, i);
      if (Number(day.slice(5, 7)) - 1 !== month) {
        break;
      }
      days.push({ day, label: String(Number(day.slice(8, 10))), served: accept(day) });
    }
    const blanks = Array.from({ length: leading }, () => ({ day: null, label: '', served: false }));
    return [...blanks, ...days];
  });

  protected move(step: number): void {
    this.offset.update((offset) => offset + step);
  }

  protected pick(cell: MonthCell): void {
    if (cell.day !== null && cell.served) {
      this.picked.emit(cell.day);
    }
  }
}
