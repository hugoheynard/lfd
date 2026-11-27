import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldCheckboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/**
 * **Sur mesure** — la case de la déclinaison ouverte
 * (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`, V2). Le
 * référentiel déclare le fait ; l'attribution à des comptes reste au commerce,
 * dans Catalogue publié.
 *
 * Elle écrit tout de suite sur sa propre route, hors de « Tout enregistrer ».
 * Un refus remet la case où elle était et affiche le message du serveur.
 */
@Component({
  selector: 'app-variant-custom-recipe-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCheckboxComponent],
  templateUrl: './variant-custom-recipe-form.html',
})
export class VariantCustomRecipeForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  private readonly variant = computed(() =>
    this.store.variants().find((entry) => entry.id === this.store.selectedVariantId()),
  );

  protected readonly checked = computed(() => this.variant()?.customRecipe ?? false);

  protected async onChange(customRecipe: boolean): Promise<void> {
    const variant = this.variant();
    if (variant === undefined) {
      return;
    }
    const previous = variant.customRecipe;
    this.store.setVariantCustomRecipe(variant.id, customRecipe);
    this.busy.set(true);
    try {
      await this.products.setVariantCustomRecipe(this.store.productId(), variant.id, customRecipe);
      this.notify.success(
        customRecipe ? 'Déclinaison déclarée sur mesure.' : "La déclinaison n'est plus sur mesure.",
      );
    } catch (caught) {
      this.store.setVariantCustomRecipe(variant.id, previous);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
