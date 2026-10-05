import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { CollectionExclusionView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import { formatCents } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';

import { CollectionBatchesService } from '../../collection-batches.service';

/** La note est bornée côté serveur à 500 caractères. */
const NOTE_MAX = 500;

/**
 * **« Réglée autrement »** — une commande écartée a été payée par un autre
 * chemin. La note est obligatoire : c'est la seule trace du règlement.
 */
@Component({
  selector: 'app-settle-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './settle-panel.html',
  styleUrl: './settle-panel.scss',
})
export class SettlePanel {
  private readonly api = inject(CollectionBatchesService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<CollectionExclusionView | undefined>(undefined);

  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly subtitle = computed(() => {
    const order = this.data();
    return order === undefined
      ? ''
      : `${order.orderNumber} — ${order.companyName} — ${formatCents(order.amountCents)}`;
  });

  protected readonly canSubmit = computed(() => {
    const note = this.note().trim();
    return note !== '' && note.length <= NOTE_MAX && !this.saving();
  });

  protected async submit(): Promise<void> {
    const order = this.data();
    if (order === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.settleOtherwise(order.orderId, this.note().trim());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "La commande n'a pas pu être marquée réglée."));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.ref.close();
  }
}
