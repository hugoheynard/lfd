import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  BatchAttestationKindView,
  CollectionBatchAttestationsView,
  CollectionBatchStatusView,
} from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent, FoldPanelHostService } from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionBatchAttestationsService } from '../../collection-batch-attestations.service';
import {
  ATTESTATION_GESTURE,
  ATTESTATION_HINT,
  ATTESTATION_KINDS_FOR,
  attestedLabel,
} from '../batch-attestation-wording';
import {
  WithdrawBatchAttestationPanel,
  type WithdrawBatchAttestationPanelData,
} from '../withdraw-batch-attestation-panel/withdraw-batch-attestation-panel';

/**
 * **Les attestations d'un lot**, sous sa barre d'actions dans l'onglet 3
 * (plan `plan-page-procedure-de-prelevement.md` § 1.2, § 3.3, P3) : « J'ai
 * relu le contrôle CSV », « J'ai signé la remise sur CENET », « J'ai lu les
 * comptes rendus PSR ». Chacune dit « fait le … par … » et se retire par un
 * panneau avec sa raison, comme « Retours contrôlés » à l'onglet 4.
 *
 * L'ordre de la procédure est rendu matériel ici : la signature n'apparaît
 * qu'un lot déposé. Une attestation ne conditionne aucun geste — elle ne
 * gouverne que l'état de l'onglet.
 */
@Component({
  selector: 'app-procedure-batch-attestations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './procedure-batch-attestations.html',
  styleUrl: './procedure-batch-attestations.scss',
})
export class ProcedureBatchAttestations {
  private readonly api = inject(CollectionBatchAttestationsService);
  private readonly panels = inject(FoldPanelHostService);

  readonly batchId = input.required<string>();
  readonly status = input.required<CollectionBatchStatusView>();
  readonly attestations = input.required<CollectionBatchAttestationsView>();
  readonly canWrite = input(false);

  /** Une attestation posée ou retirée — l'hôte relit l'état de la procédure. */
  readonly changed = output();

  protected readonly attesting = signal<BatchAttestationKindView | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly rows = computed(() =>
    ATTESTATION_KINDS_FOR[this.status()].map((kind) => ({
      kind,
      gesture: ATTESTATION_GESTURE[kind],
      hint: ATTESTATION_HINT[kind],
      done: this.attestations()[kind],
    })),
  );

  protected readonly attested = attestedLabel;

  protected async attest(kind: BatchAttestationKindView): Promise<void> {
    this.attesting.set(kind);
    this.error.set(null);
    try {
      await this.api.attest(this.batchId(), kind);
      this.changed.emit();
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'L’attestation n’a pas pu être notée.'));
    } finally {
      this.attesting.set(null);
    }
  }

  protected async withdraw(kind: BatchAttestationKindView): Promise<void> {
    const data: WithdrawBatchAttestationPanelData = { batchId: this.batchId(), kind };
    const done = await this.panels.open<WithdrawBatchAttestationPanelData, boolean>(
      WithdrawBatchAttestationPanel,
      { data, width: 'md' },
    ).closed;
    if (done === true) {
      this.changed.emit();
    }
  }
}
