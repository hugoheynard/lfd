import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { OperationView } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import { refusalOf } from '../operation-format';
import {
  cycleOf,
  draftOf,
  EMPTY_SCHEDULE,
  readSchedule,
  type ScheduleDraft,
} from '../operation-schedule';
import { OperationsService } from '../operations.service';
import { ScheduleForm } from '../schedule-form/schedule-form';

/**
 * **Calendrier** — les cinq dates, et le cycle qu'elles dessinent : annonce,
 * commande, retrait, extinction (plan, D2).
 *
 * Le cycle affiché est celui qui est ENREGISTRÉ, pas celui qu'on saisit : il
 * répond à « que voit la boutique », et un brouillon n'y change rien tant qu'il
 * n'est pas accepté par le serveur. L'ordre des dates est vérifié là-bas ; son
 * refus nomme les dates en cause.
 */
@Component({
  selector: 'app-schedule-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    ScheduleForm,
  ],
  templateUrl: './schedule-card.html',
  styleUrl: './schedule-card.scss',
})
export class ScheduleCard {
  private readonly api = inject(OperationsService);

  readonly operation = input.required<OperationView>();
  readonly locked = input(false);
  readonly saved = output<string>();

  protected readonly draft = signal<ScheduleDraft>(EMPTY_SCHEDULE);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly cycle = computed(() => cycleOf(this.operation()));
  private readonly reading = computed(() => readSchedule(this.draft()));
  private readonly stored = computed(() => draftOf(this.operation()));

  protected readonly problem = computed(() => {
    const reading = this.reading();
    return reading.ok ? null : reading.problem;
  });

  protected readonly changed = computed(() => {
    const draft = this.draft();
    const stored = this.stored();
    return (Object.keys(stored) as (keyof ScheduleDraft)[]).some(
      (field) => draft[field] !== stored[field],
    );
  });

  constructor() {
    effect(() => {
      this.draft.set(this.stored());
    });
  }

  protected async save(): Promise<void> {
    const reading = this.reading();
    if (!reading.ok || this.locked()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.api.reschedule(this.operation().key, reading.payload);
      this.saved.emit('Calendrier enregistré.');
    } catch (error) {
      this.refusal.set(refusalOf(error, "Le calendrier n'a pas pu être enregistré."));
    } finally {
      this.busy.set(false);
    }
  }
}
