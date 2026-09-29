import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Demande le froid** — la case de la fiche (lot 4 bis du plan de
 * préparation de tournée, v2-2 : le froid est une propriété du produit).
 *
 * Elle écrit **immédiatement**, comme la vente en opération : le drapeau a sa
 * propre route et son propre fait au journal. Un refus remet la case où elle
 * était : une case cochée sur un refus affirmerait un froid que le serveur n'a
 * pas enregistré.
 */
@Component({
  selector: 'app-cold-requirement-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './cold-requirement-form.html',
})
export class ColdRequirementForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected async onChange(requiresCold: boolean): Promise<void> {
    const previous = this.store.requiresCold();
    this.store.requiresCold.set(requiresCold);
    this.busy.set(true);
    try {
      await this.products.setColdRequirement(this.store.productId(), requiresCold);
      this.notify.success(
        requiresCold ? "L'article demande le froid." : "L'article ne demande plus le froid.",
      );
    } catch (caught) {
      this.store.requiresCold.set(previous);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
