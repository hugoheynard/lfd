import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalendarDayDirective,
  FoldCalendarMonthComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { dayLabelOf } from '../../production/worksheet-day';

const MONTH_TITLE = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** `AAAA-MM-JJ` → le 1er du mois d'avant ou d'après. */
export function shiftMonth(isoDay: string, months: number): string {
  const [year, month] = isoDay.split('-').map(Number);
  const first = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, 1));
  return first.toISOString().slice(0, 10);
}

/**
 * **Le calendrier du masthead** (Supervision v2, A1) : un bouton, et un
 * popover pour toute date hors d'hier, aujourd'hui et demain. Il ne sait pas
 * naviguer : il rend un jour (`pick`), ou `null` pour revenir au jour du
 * serveur — la page porte `goTo()` et l'adresse.
 *
 * La grille est un `fold-calendar-month` sans événement, resserré par ses
 * variables ; le jour choisi se dit par une classe de la cellule projetée.
 */
@Component({
  selector: 'app-supervision-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalendarDayDirective,
    FoldCalendarMonthComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './supervision-calendar.html',
  styleUrl: './supervision-calendar.scss',
})
export class SupervisionCalendar {
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
    return this.custom() && selected !== null ? dayLabelOf(selected) : '';
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
