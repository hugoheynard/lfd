import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollectionBatchView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { CollectionBatchesService } from '../collection-batches.service';

/** Le motif est borné côté serveur à 200 caractères (domaine). */
const REASON_MAX = 200;

/**
 * **« La banque a rejeté ce fichier »** — un lot DÉPOSÉ dont la banque a
 * refusé le fichier entier (accusé PSR1), avant toute signature (plan
 * `plan-lot-rejete-par-la-banque.md`, § 7).
 *
 * Le risque qu'aucun code ne ferme est de déclarer rejetée une remise
 * PARTIE : le lot reconstitué débiterait une seconde fois. D'où l'attestation
 * à cocher et le motif obligatoire ; le serveur refuse en plus dès qu'une
 * ligne a un retour, et à partir du jour d'échéance.
 */
@Component({
  selector: 'app-batch-rejected-by-bank-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './batch-rejected-by-bank-panel.html',
  styleUrl: './batch-rejected-by-bank-panel.scss',
})
export class BatchRejectedByBankPanel {
  private readonly api = inject(CollectionBatchesService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<CollectionBatchView | undefined>(undefined);

  protected readonly attested = signal(false);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const batch = this.data();
    return batch === undefined ? '' : `Lot ${batch.scheme} — ${batch.periodLabel}`;
  });

  protected readonly canSubmit = computed(() => {
    const reason = this.reason().trim();
    return this.attested() && reason !== '' && reason.length <= REASON_MAX && !this.saving();
  });

  protected async submit(): Promise<void> {
    const batch = this.data();
    if (batch === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.rejectedByBank(batch.id, this.reason().trim());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le rejet n’a pas pu être enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
