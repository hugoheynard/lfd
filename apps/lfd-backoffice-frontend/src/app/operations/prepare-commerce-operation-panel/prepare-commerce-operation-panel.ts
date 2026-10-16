import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CommerceOperationAudience } from '@lfd/contracts';
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

import { AUDIENCE_OPTIONS, refusalOf } from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { EMPTY_SCHEDULE, readSchedule, type ScheduleDraft } from '../operation-schedule';
import { ScheduleForm } from '../schedule-form/schedule-form';

/**
 * **Préparer une opération au commerce** — le minimum pour qu'elle existe :
 * sa clé, son nom, ses cinq dates et sa clientèle. Le chapeau, l'image et la
 * sélection se règlent ensuite sur sa page, où l'on arrive dès la création.
 *
 * Ferme sur la clé créée ; renoncer ne rend rien. Un refus du serveur reste
 * dans le panneau, tel qu'il est écrit.
 */
@Component({
  selector: 'app-prepare-commerce-operation-panel',
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
  templateUrl: './prepare-commerce-operation-panel.html',
  styleUrl: './prepare-commerce-operation-panel.scss',
})
export class PrepareCommerceOperationPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);
  private readonly api = inject(CommerceOperationsService);

  protected readonly audiences = AUDIENCE_OPTIONS;

  protected readonly key = signal('');
  protected readonly name = signal('');
  protected readonly schedule = signal<ScheduleDraft>(EMPTY_SCHEDULE);
  protected readonly audience = signal<CommerceOperationAudience>('both');
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
