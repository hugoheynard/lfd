import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { PromotionHoursMomentValue, Weekday } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldFieldsetComponent,
  FoldListboxComponent,
  FoldTimeComponent,
} from 'fold-ng';

import {
  MIDNIGHT_END,
  NEW_WINDOW,
  WEEK,
  WEEKDAY_SHORT,
  WORKWEEK,
  type DraftHours,
  type DraftHoursWindow,
} from '../promotion-hours';

const MOMENT_OPTIONS: readonly { value: PromotionHoursMomentValue; label: string }[] = [
  { value: 'ordered_at', label: 'À la commande' },
  { value: 'handover_at', label: 'Au créneau de retrait ou de livraison' },
];

/**
 * **« Seulement certains jours et heures »** — la condition `weekly_hours`
 * d'une remise au panier (`documentation/promotions/plan-jours-et-heures.md`,
 * § 8 et § 11). Elle ne juge rien : la page lit `hoursProblem`, et le serveur
 * reste juge. Désactivée, elle ne publie aucun changement.
 */
@Component({
  selector: 'app-promotion-hours-fieldset',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldFieldsetComponent,
    FoldListboxComponent,
    FoldTimeComponent,
  ],
  templateUrl: './promotion-hours-fieldset.html',
  styleUrl: './promotion-hours-fieldset.scss',
})
export class PromotionHoursFieldset {
  readonly hours = input.required<DraftHours>();
  readonly disabled = input(false);
  readonly hoursChange = output<DraftHours>();

  protected readonly week = WEEK;
  protected readonly dayLabel = WEEKDAY_SHORT;
  protected readonly momentOptions = MOMENT_OPTIONS;
  protected readonly midnight = MIDNIGHT_END;
  protected readonly momentHint = computed(() =>
    this.hours().moment === 'ordered_at'
      ? "L'heure où le client commande, à Paris."
      : "Le début du créneau choisi (sa fin s'il n'en a pas) ; sans créneau, la remise ne s'applique pas.",
  );

  protected patch(change: Partial<DraftHours>): void {
    if (!this.disabled()) {
      this.hoursChange.emit({ ...this.hours(), ...change });
    }
  }

  protected patchWindow(index: number, change: Partial<DraftHoursWindow>): void {
    this.patch({
      windows: this.hours().windows.map((window, at) =>
        at === index ? { ...window, ...change } : window,
      ),
    });
  }

  protected toggleDay(index: number, day: Weekday, checked: boolean): void {
    const window = this.hours().windows[index];
    if (window === undefined) {
      return;
    }
    const weekdays = checked
      ? WEEK.filter((each) => each === day || window.weekdays.includes(each))
      : window.weekdays.filter((each) => each !== day);
    this.patchWindow(index, { weekdays });
  }

  protected everyDay(index: number): void {
    this.patchWindow(index, { weekdays: WEEK });
  }

  protected workweek(index: number): void {
    this.patchWindow(index, { weekdays: WORKWEEK });
  }

  /** « Jusqu'à minuit » : la fin devient `24:00`, que le contrôle d'heure ne sait pas dire. */
  protected untilMidnight(index: number, checked: boolean): void {
    this.patchWindow(index, { end: checked ? MIDNIGHT_END : '' });
  }

  protected addWindow(): void {
    this.patch({ windows: [...this.hours().windows, NEW_WINDOW] });
  }

  protected removeWindow(index: number): void {
    this.patch({ windows: this.hours().windows.filter((_, at) => at !== index) });
  }
}
