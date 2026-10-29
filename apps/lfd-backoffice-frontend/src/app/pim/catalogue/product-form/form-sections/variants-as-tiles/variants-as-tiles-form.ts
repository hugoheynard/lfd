import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Montrer chaque déclinaison en vignette** — la case de la fiche
 * (`documentation/catalogue/plan-declinaisons-en-vignette.md`, V1).
 *
 * Elle écrit **immédiatement**, comme le froid : l'option a sa propre route et
 * son propre fait au journal. Un refus remet la case où elle était.
 */
@Component({
  selector: 'app-variants-as-tiles-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './variants-as-tiles-form.html',
})
export class VariantsAsTilesForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected async onChange(variantsAsTiles: boolean): Promise<void> {
    const previous = this.store.variantsAsTiles();
    this.store.variantsAsTiles.set(variantsAsTiles);
    this.busy.set(true);
    try {
      await this.products.setVariantsAsTiles(this.store.productId(), variantsAsTiles);
      this.notify.success(
        variantsAsTiles
          ? 'Chaque déclinaison a sa vignette en boutique.'
          : 'Seule la déclinaison par défaut paraît en boutique.',
      );
    } catch (caught) {
      this.store.variantsAsTiles.set(previous);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
