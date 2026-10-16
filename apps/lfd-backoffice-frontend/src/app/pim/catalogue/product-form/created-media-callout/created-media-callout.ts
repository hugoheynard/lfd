import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { ProductFormStore } from '../product-form-store';

/**
 * L'encart des photos refusées juste après la création d'une fiche.
 *
 * Sans lui, le refus se perdait : la page naviguait vers la fiche créée, qui
 * relisait des visuels vides, et rien ne disait qu'une photo manquait
 * (signalé par Hugo le 2026-10-16).
 */
@Component({
  selector: 'app-created-media-callout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './created-media-callout.html',
  styleUrl: './created-media-callout.scss',
})
export class CreatedMediaCallout {
  protected readonly store = inject(ProductFormStore);

  protected readonly failure = this.store.createdMediaFailure;

  protected readonly headline = computed(() => {
    const count = this.failure()?.slots.length ?? 0;
    return count === 1
      ? '1 photo n’a pas pu être enregistrée'
      : `${count} photos n’ont pas pu être enregistrées`;
  });

  protected retry(): void {
    void this.store.retryCreatedMedia();
  }
}
