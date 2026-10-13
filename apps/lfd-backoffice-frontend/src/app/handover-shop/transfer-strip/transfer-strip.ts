import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { HandoverQueueEntryView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPanelHostService,
} from 'fold-ng';

import {
  receivable,
  transferStateLabel,
  transferStateVariant,
  transferSummary,
  transfersOf,
  type CounterTransfer,
} from '../handover-transfer';
import { TransferReceptionDialog } from '../transfer-reception-dialog/transfer-reception-dialog';

/**
 * **En tête de l'onglet d'un site servi par transfert** : où en est chaque
 * transfert du jour (prévu, parti, reçu, nombre de bacs), et « Réceptionner »
 * (plan du transfert interne, §6, lots T2–T3).
 *
 * Rien à montrer sur un onglet sans transfert : le composant ne rend alors
 * rien, et la file reste telle qu'elle était.
 */
@Component({
  selector: 'app-transfer-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './transfer-strip.html',
  styleUrl: './transfer-strip.scss',
})
export class TransferStrip {
  private readonly panels = inject(FoldPanelHostService);

  /** Les lignes de l'onglet ouvert. */
  readonly entries = input.required<readonly HandoverQueueEntryView[]>();
  /** `handover_counter:write` — sans lui, l'état se lit, le bouton n'existe pas. */
  readonly canReceive = input<boolean>(false);
  /** Un transfert vient d'être réceptionné : la file est à relire. */
  readonly received = output<void>();

  protected readonly transfers = computed(() => transfersOf(this.entries()));

  protected title(transfer: CounterTransfer): string {
    return `Transfert → ${transfer.siteLabel}`;
  }

  protected summary(transfer: CounterTransfer): string {
    return transferSummary(transfer);
  }

  protected stateLabel(transfer: CounterTransfer): string {
    return transferStateLabel(transfer.state);
  }

  protected stateVariant(transfer: CounterTransfer): ReturnType<typeof transferStateVariant> {
    return transferStateVariant(transfer.state);
  }

  protected receivable(transfer: CounterTransfer): boolean {
    return this.canReceive() && receivable(transfer);
  }

  protected receive(transfer: CounterTransfer): void {
    const ref = this.panels.open<CounterTransfer, boolean>(TransferReceptionDialog, {
      data: transfer,
    });
    void ref.closed.then((done) => {
      if (done === true) {
        this.received.emit();
      }
    });
  }
}
