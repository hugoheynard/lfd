import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Vendu seulement pendant une opération** — la case de la fiche (D3 du plan
 * des opérations datées).
 *
 * Elle écrit **immédiatement**, comme la case d'alignement de la limite de
 * commande : le drapeau a sa propre route et son propre fait au journal, il
 * n'appartient à aucune section. L'accrocher à « Tout enregistrer » ferait
 * croire que le bouton le sauve.
 *
 * Un refus remet la case où elle était : une case cochée sur un refus
 * affirmerait une restriction que le serveur n'a pas posée.
 */
@Component({
  selector: 'app-operation-only-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './operation-only-form.html',
})
export class OperationOnlyForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected async onChange(operationOnly: boolean): Promise<void> {
    const previous = this.store.operationOnly();
    this.store.operationOnly.set(operationOnly);
    this.busy.set(true);
    try {
      await this.products.setOperationOnly(this.store.productId(), operationOnly);
      this.notify.success(
        operationOnly
          ? 'Article réservé aux opérations.'
          : "L'article est de nouveau vendu hors opération.",
      );
    } catch (caught) {
      this.store.operationOnly.set(previous);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
