import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollectionTestView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionTestsService } from '../../collection-tests.service';
import { day, euros } from '../../invoice-dossier-format';

export interface RefundTestPanelData {
  readonly test: CollectionTestView;
}

/**
 * **« Marqué remboursé »** (Q4, Hugo 2026-10-22) : le jour où le virement a
 * été rendu à l'établissement. Le serveur refuse un jour futur ou antérieur à
 * l'échéance, et un essai que la banque a rejeté ou retourné.
 */
@Component({
  selector: 'app-refund-test-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldDateComponent, FoldPanelHeaderComponent],
  templateUrl: './refund-test-panel.html',
  styleUrl: './refund-test-panel.scss',
})
export class RefundTestPanel {
  private readonly api = inject(CollectionTestsService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<RefundTestPanelData | undefined>(undefined);

  protected readonly refundedOn = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const test = this.data()?.test;
    return test === undefined
      ? ''
      : `${test.debtorName} — ${euros(test.amountCents)}, échéance du ${day(test.requestedCollectionDay)}`;
  });

  protected readonly canSubmit = computed(() => this.refundedOn() !== '' && !this.saving());

  protected async submit(): Promise<void> {
    const test = this.data()?.test;
    if (test === undefined) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.markRefunded(test.id, this.refundedOn());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, 'Le remboursement n’a pas été enregistré.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
