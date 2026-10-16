import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { FoldDateComponent, FoldTimeComponent } from 'fold-ng';

import type { ScheduleDraft } from '../operation-schedule';

/**
 * **Les cinq dates d'une opération**, saisies en heure de Paris.
 *
 * Partagé par la préparation et la carte Calendrier : les deux saisissent la
 * même chose, et deux formulaires finiraient par ne pas demander les mêmes
 * champs. Il ne convertit rien — la conversion vit dans `operation-schedule.ts`,
 * au seul endroit que `lint:business-day` doit relire.
 */
@Component({
  selector: 'app-schedule-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDateComponent, FoldTimeComponent],
  templateUrl: './schedule-form.html',
  styleUrl: './schedule-form.scss',
})
export class ScheduleForm {
  readonly draft = model.required<ScheduleDraft>();

  protected set(field: keyof ScheduleDraft, value: string): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
  }
}
