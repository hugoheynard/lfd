import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldTimeComponent } from 'fold-ng';

import {
  addRange,
  clearDay,
  copyToWeekdays,
  editRange,
  hasInvalidRange,
  removeRange,
  WEEK_DAYS,
  type AvailabilityDraft,
  type DraftRange,
} from '../availability-draft';

/**
 * Carte **Semaine type** : les plages où le commercial accepte des rendez-vous,
 * jour par jour.
 *
 * Le brouillon descend en `input` et remonte modifié par `changed` : la carte ne
 * possède pas l'état, elle applique les fonctions pures d'`availability-draft`.
 * C'est ce qui permet aux quatre cartes d'éditer le **même** brouillon sans
 * qu'aucune ne devienne la source de vérité.
 */
@Component({
  selector: 'app-week-grid-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldTimeComponent],
  templateUrl: './week-grid-card.html',
  styleUrl: './week-grid-card.scss',
})
export class WeekGridCard {
  readonly draft = input.required<AvailabilityDraft>();
  readonly changed = output<AvailabilityDraft>();

  protected readonly weekDays = WEEK_DAYS;

  /** Les plages d'un jour de semaine (index `Date.getDay()`). */
  protected rangesOf(weekday: number): readonly DraftRange[] {
    return this.draft().week[weekday] ?? [];
  }

  /** Une plage dont la fin précède le début : on le dit avant d'enregistrer. */
  protected get invalid(): boolean {
    return hasInvalidRange(this.draft());
  }

  protected addRange(weekday: number): void {
    this.changed.emit(addRange(this.draft(), weekday));
  }

  protected removeRange(weekday: number, index: number): void {
    this.changed.emit(removeRange(this.draft(), weekday, index));
  }

  protected setStart(weekday: number, index: number, startTime: string): void {
    this.changed.emit(editRange(this.draft(), weekday, index, { startTime }));
  }

  protected setEnd(weekday: number, index: number, endTime: string): void {
    this.changed.emit(editRange(this.draft(), weekday, index, { endTime }));
  }

  protected copyToWeekdays(weekday: number): void {
    this.changed.emit(copyToWeekdays(this.draft(), weekday));
  }

  protected clearDay(weekday: number): void {
    this.changed.emit(clearDay(this.draft(), weekday));
  }
}
