import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Sur mesure** — la case de la fiche (D1 de la révision 3 du plan des
 * articles sur mesure). Le référentiel déclare le fait ; l'attribution à des
 * comptes reste au commerce, dans Catalogue publié (D2).
 *
 * Même mécanique que la vente en opération : elle écrit tout de suite sur sa
 * propre route, hors de « Tout enregistrer », et un refus remet la case où elle
 * était.
 */
@Component({
  selector: 'app-custom-recipe-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './custom-recipe-form.html',
})
export class CustomRecipeForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected async onChange(customRecipe: boolean): Promise<void> {
    const previous = this.store.customRecipe();
    this.store.customRecipe.set(customRecipe);
    this.busy.set(true);
    try {
      await this.products.setCustomRecipe(this.store.productId(), customRecipe);
      this.notify.success(
        customRecipe ? 'Article déclaré sur mesure.' : "L'article n'est plus sur mesure.",
      );
    } catch (caught) {
      this.store.customRecipe.set(previous);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
