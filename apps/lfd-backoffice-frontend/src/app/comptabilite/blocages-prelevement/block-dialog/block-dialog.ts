import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { DirectDebitBlocksService } from '../../direct-debit-blocks.service';

/** Bornes de la raison — les mêmes que le payload serveur (`blockDirectDebitPayload`). */
export const BLOCK_REASON_MAX = 500;

/** Charge d'ouverture : la société visée, et son nom tel que l'écran le montre. */
export interface BlockDialogData {
  readonly companyId: string;
  readonly companyName: string;
}

/**
 * **Bloquer le prélèvement mensuel d'un client, en disant pourquoi.**
 *
 * La raison est OBLIGATOIRE, à l'inverse de l'archivage tarifaire : c'est ce
 * que lira le personnel suivant, au téléphone avec un client qui demande
 * pourquoi on lui réclame sa carte. Le serveur la refuse vide ; l'écran ne
 * propose pas d'envoyer ce qu'il sait refusé.
 *
 * Un refus du serveur reste dans le dialogue, mot pour mot, et le dialogue
 * reste ouvert. Un succès ferme sur `true` — l'appelant relit la liste.
 */
@Component({
  selector: 'app-block-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './block-dialog.html',
  styleUrl: './block-dialog.scss',
})
export class BlockDialog {
  private readonly api = inject(DirectDebitBlocksService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<BlockDialogData | undefined>(undefined);

  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly companyName = computed(() => this.data()?.companyName ?? '');
  protected readonly maxLength = BLOCK_REASON_MAX;

  private readonly trimmed = computed(() => this.reason().trim());

  protected readonly tooLong = computed(() => this.trimmed().length > BLOCK_REASON_MAX);

  protected readonly canSubmit = computed(
    () => this.trimmed() !== '' && !this.tooLong() && !this.saving(),
  );

  protected async submit(): Promise<void> {
    const data = this.data();
    if (data === undefined || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.block(data.companyId, this.trimmed());
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "Le prélèvement n'a pas pu être bloqué."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
