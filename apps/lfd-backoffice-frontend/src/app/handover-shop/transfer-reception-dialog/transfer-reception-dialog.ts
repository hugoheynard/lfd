import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TRANSFER_RECEPTION_REASON_MAX } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { HandoverQueueService } from '../handover-queue.service';
import { reasonRequired, transferSummary, type CounterTransfer } from '../handover-transfer';

/**
 * **« Réceptionner » un transfert au comptoir du site** (plan du transfert
 * interne, §6.3–6.4, lot T2).
 *
 * Parti dans une tournée, le transfert se réceptionne d'un geste, motif
 * facultatif. Jamais parti — aucune tournée ne l'a emporté —, c'est la
 * réception MANUELLE : le motif est obligatoire, parce que c'est lui qui
 * répondra plus tard à « comment est-elle arrivée ? ». Le domaine le revérifie.
 *
 * Un refus du serveur reste dans le dialogue ; un succès ferme sur `true`.
 */
@Component({
  selector: 'app-transfer-reception-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './transfer-reception-dialog.html',
  styleUrl: './transfer-reception-dialog.scss',
})
export class TransferReceptionDialog implements FoldPanelContent<CounterTransfer> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<CounterTransfer>();

  private readonly api = inject(HandoverQueueService);
  private readonly panel = inject(FoldPanelRef<boolean>);

  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly maxLength = TRANSFER_RECEPTION_REASON_MAX;

  protected readonly title = computed(() => `Réceptionner · ${this.data().siteLabel}`);
  protected readonly summary = computed(() => transferSummary(this.data()));
  protected readonly manual = computed(() => reasonRequired(this.data()));

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(
    () => this.trimmed().length > TRANSFER_RECEPTION_REASON_MAX,
  );

  protected readonly canSubmit = computed(
    () => !this.saving() && !this.tooLong() && (!this.manual() || this.trimmed() !== ''),
  );

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const reason = this.trimmed();
      await this.api.receiveTransfer(this.data().anyOrderId, reason === '' ? null : reason);
      this.panel.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le transfert n'a pas pu être réceptionné."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close();
  }
}
