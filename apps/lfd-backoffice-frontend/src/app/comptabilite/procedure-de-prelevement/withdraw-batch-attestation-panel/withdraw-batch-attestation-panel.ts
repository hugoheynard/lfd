import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { BatchAttestationKindView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionBatchAttestationsService } from '../../collection-batch-attestations.service';
import { ATTESTATION_NAME } from '../batch-attestation-wording';

/** L'attestation qu'on retire, et son lot. */
export interface WithdrawBatchAttestationPanelData {
  readonly batchId: string;
  readonly kind: BatchAttestationKindView;
}

/** La raison d'un retrait tient en une phrase (le serveur borne à 500). */
const NOTE_MAX = 500;

/**
 * **Retirer une attestation d'un lot** (plan
 * `plan-page-procedure-de-prelevement.md` § 1.2) : une attestation fausse ne
 * s'efface pas, elle se retire par une ligne de plus — et un retrait dit
 * pourquoi. Même forme que le retrait de « Retours contrôlés ».
 */
@Component({
  selector: 'app-withdraw-batch-attestation-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './withdraw-batch-attestation-panel.html',
  styleUrl: './withdraw-batch-attestation-panel.scss',
})
export class WithdrawBatchAttestationPanel {
  private readonly api = inject(CollectionBatchAttestationsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<WithdrawBatchAttestationPanelData | undefined>(undefined);

  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly title = computed(() => {
    const target = this.data();
    return target === undefined
      ? 'Retirer l’attestation'
      : `Retirer ${ATTESTATION_NAME[target.kind]}`;
  });

  protected readonly canSubmit = computed(() => {
    const said = this.note().trim();
    return said !== '' && said.length <= NOTE_MAX && !this.saving();
  });

  protected async submit(): Promise<void> {
    const target = this.data();
    if (target === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.withdraw(target.batchId, target.kind, this.note().trim());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'L’attestation n’a pas pu être retirée.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
