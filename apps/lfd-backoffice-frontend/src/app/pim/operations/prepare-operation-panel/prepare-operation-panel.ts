import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OperationAudience } from '@lfd/pim-contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { AUDIENCE_OPTIONS, refusalOf } from '../operation-format';
import { EMPTY_SCHEDULE, readSchedule, type ScheduleDraft } from '../operation-schedule';
import { OperationsService } from '../operations.service';
import { ScheduleForm } from '../schedule-form/schedule-form';

/**
 * **Préparer une opération** — le minimum pour qu'elle existe : sa clé, son
 * nom, ses cinq dates et sa clientèle, c'est-à-dire ce que le contrat de
 * création exige. L'accroche, l'image et la sélection se règlent ensuite sur
 * sa page : on y arrive dès que la création réussit.
 *
 * Un panneau et non une page : c'est un seul sujet, lu de haut en bas, et la
 * liste reste derrière si l'on renonce.
 *
 * Ferme sur la clé créée ; renoncer ne rend rien.
 */
@Component({
  selector: 'app-prepare-operation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    ScheduleForm,
  ],
  templateUrl: './prepare-operation-panel.html',
  styleUrl: './prepare-operation-panel.scss',
})
export class PrepareOperationPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);
  private readonly api = inject(OperationsService);

  protected readonly audiences = AUDIENCE_OPTIONS;

  protected readonly key = signal('');
  protected readonly name = signal('');
  protected readonly schedule = signal<ScheduleDraft>(EMPTY_SCHEDULE);
  protected readonly audience = signal<OperationAudience>('both');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  private readonly reading = computed(() => readSchedule(this.schedule()));

  /** Ce qui manque encore — une phrase, pour que le bouton fermé dise pourquoi. */
  protected readonly missing = computed<string | null>(() => {
    if (this.key().trim() === '') {
      return 'Donnez une clé à l’opération.';
    }
    if (this.name().trim() === '') {
      return 'Donnez-lui un nom en français.';
    }
    const reading = this.reading();
    return reading.ok ? null : reading.problem;
  });

  protected async submit(): Promise<void> {
    const reading = this.reading();
    if (this.missing() !== null || !reading.ok) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const created = await this.api.prepare({
        key: this.key().trim(),
        name: { fr: this.name().trim() },
        lede: null,
        image: null,
        audience: this.audience(),
        ...reading.payload,
      });
      this.ref.close(created.key);
    } catch (error) {
      this.refusal.set(refusalOf(error, "L'opération n'a pas pu être préparée."));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
