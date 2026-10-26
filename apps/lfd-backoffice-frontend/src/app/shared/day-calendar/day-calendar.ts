import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalendarDayDirective,
  FoldCalendarMonthComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

/** « mercredi 16 septembre » — la date lointaine, en toutes lettres sur le bouton. */
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** `AAAA-MM-JJ` → le 1er du mois d'avant ou d'après. */
export function shiftMonth(isoDay: string, months: number): string {
  const [year, month] = isoDay.split('-').map(Number);
  const first = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, 1));
  return first.toISOString().slice(0, 10);
}

/**
 * **Le calendrier d'un bandeau** (Supervision v2, A1) : un bouton, et un
 * popover pour toute date hors d'hier, aujourd'hui et demain. Il ne sait pas
 * naviguer : il rend un jour (`pick`), ou `null` pour revenir au jour de
 * référence (`today`) — l'écran porte l'adresse.
 *
 * Sorti de la Supervision le 2026-10-26 (Hugo) : le bandeau de Tour manager
 * ouvre une date lointaine par le même contrôle.
 *
 * La grille est un `fold-calendar-month` sans événement, resserré par ses
 * variables ; le jour choisi se dit par une classe de la cellule projetée.
 */
@Component({
  selector: 'app-day-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalendarDayDirective,
    FoldCalendarMonthComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './day-calendar.html',
  styleUrl: './day-calendar.scss',
})
export class DayCalendar {
  /** Le jour regardé, `null` tant qu'il n'est pas connu. */
  readonly selected = input<string | null>(null);
  /** Le jour du serveur — cerclé. */
  readonly today = input<string | null>(null);
  /** Hors ±1 : le bouton dit la date en toutes lettres. */
  readonly custom = input(false);
  readonly narrow = input(false);

  readonly pick = output<string | null>();

  protected readonly open = signal(false);
  /** Le mois affiché — recalé sur le jour regardé à chaque ouverture. */
  protected readonly month = signal('');

  protected readonly title = computed(() => {
    const month = this.month();
    return month === '' ? '' : MONTH_TITLE.format(new Date(`${month}T00:00:00`));
  });

  protected readonly label = computed(() => {
    const selected = this.selected();
    return this.custom() && selected !== null
      ? DAY_LABEL.format(new Date(`${selected}T00:00:00`))
      : '';
  });

  protected toggle(open: boolean): void {
    if (open) {
      this.month.set(this.selected() ?? this.today() ?? '');
    }
    this.open.set(open);
  }

  protected page(months: number): void {
    const month = this.month();
    if (month !== '') {
      this.month.set(shiftMonth(month, months));
    }
  }

  protected choose(day: string | null): void {
    this.open.set(false);
    this.pick.emit(day === this.today() ? null : day);
  }

  /** Recale le mois quand la grille le fait défiler au clavier. */
  protected follow(month: string): void {
    this.month.set(month);
  }
}
