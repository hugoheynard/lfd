import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldNumberInputComponent } from 'fold-ng';

import { ResupplyReceiptsService } from '../resupply-receipts.service';
import type { StockRow } from '../resupply-stock-rows';

/**
 * **Le reçu sans commande d'un article**, ouvert depuis le menu de sa ligne :
 * ce qui est arrivé au point sans avoir été demandé. Saisi, corrigé, ou
 * retiré s'il est vidé ; la page relit le stock ensuite.
 *
 * Le refus remonte à la table plutôt que de s'afficher ici : il se lit avec
 * les autres refus, au-dessus de la table, pas dans une cellule étroite.
 */
@Component({
  selector: 'app-unordered-receipt-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldNumberInputComponent],
  templateUrl: './unordered-receipt-editor.html',
  styleUrl: './unordered-receipt-editor.scss',
})
export class UnorderedReceiptEditor {
  private readonly receipts = inject(ResupplyReceiptsService);

  readonly siteId = input.required<string>();
  readonly day = input.required<string>();
  readonly row = input.required<StockRow>();
  /** Le reçu est écrit : la table ferme l'éditeur et la page relit. */
  readonly saved = output();
  readonly closed = output();
  /** Le refus du serveur, ou `null` quand on réessaie. */
  readonly failure = output<string | null>();

  /** La quantité saisie, partie du reçu déjà enregistré. */
  readonly quantity = linkedSignal(() => this.row().unordered);
  protected readonly pending = signal(false);

  /** Au poids, la saisie en grammes se relit « 1,25 kg » sous la case. */
  protected readonly hint = computed(() => {
    const grams = this.quantity();
    return this.row().saleUnit === 'weight' &&
      grams !== null &&
      Number.isSafeInteger(grams) &&
      grams > 0
      ? saleQuantityLabel(grams, 'weight')
      : undefined;
  });

  async save(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.emit(null);
    try {
      await this.write(this.row().unordered, this.quantity());
      this.saved.emit();
    } catch (error) {
      this.failure.emit(
        httpErrorMessage(error, "Le reçu sans commande n'a pas pu être enregistré."),
      );
    } finally {
      this.pending.set(false);
    }
  }

  /** Absent puis saisi : on reçoit ; présent puis vidé : on retire ; sinon on corrige. */
  private async write(before: number | null, after: number | null): Promise<void> {
    const sku = this.row().sku;
    if (before === null && after !== null) {
      await this.receipts.receive(this.siteId(), this.day(), sku, after);
    } else if (before !== null && after === null) {
      await this.receipts.withdraw(this.siteId(), this.day(), sku);
    } else if (before !== null && after !== null) {
      await this.receipts.correct(this.siteId(), this.day(), sku, after);
    }
  }
}
