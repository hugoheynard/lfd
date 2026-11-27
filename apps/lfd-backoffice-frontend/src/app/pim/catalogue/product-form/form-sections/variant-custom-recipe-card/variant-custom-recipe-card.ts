import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';
import { variantTabLabel } from '../../variant-label';

/** Ce qu'une ligne de la carte montre d'une déclinaison. */
interface CustomRecipeRow {
  readonly id: string;
  readonly label: string;
  readonly customRecipe: boolean;
  readonly action: string;
  readonly message: string;
}

const ENABLE_MESSAGE =
  "Plus aucun pro ne verra cette déclinaison tant qu'elle n'est attribuée à aucun compte client, dans Catalogue publié.";
const DISABLE_MESSAGE =
  'Cette déclinaison sera à nouveau accessible à toute son audience. Les comptes clients qui lui sont attribués seront retirés.';

/**
 * **Produit sur mesure (clientèle restreinte)** — une ligne par déclinaison,
 * son état, et le geste qui le renverse derrière une confirmation
 * (`documentation/catalogue/plan-fin-du-sur-mesure.md`, D1).
 *
 * Le geste a des conséquences hors de la fiche (la déclinaison disparaît des
 * pros, ou perd ses attributions) : rien ne part sans confirmation. Il écrit
 * tout de suite sur sa propre route, hors de « Tout enregistrer » ; un refus
 * remet l'état et affiche le message du serveur.
 */
@Component({
  selector: 'app-variant-custom-recipe-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent],
  templateUrl: './variant-custom-recipe-card.html',
  styleUrl: './variant-custom-recipe-card.scss',
})
export class VariantCustomRecipeCard {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  protected readonly confirmLabels = { confirm: 'Confirmer', cancel: 'Annuler' } as const;

  protected readonly rows = computed<readonly CustomRecipeRow[]>(() =>
    this.store.variants().map((variant) => ({
      id: variant.id,
      label: variantTabLabel(variant),
      customRecipe: variant.customRecipe,
      action: variant.customRecipe ? 'Désactiver sur mesure' : 'Activer sur mesure',
      message: variant.customRecipe ? DISABLE_MESSAGE : ENABLE_MESSAGE,
    })),
  );

  protected async apply(variantId: string, customRecipe: boolean): Promise<void> {
    this.store.setVariantCustomRecipe(variantId, customRecipe);
    this.busy.set(true);
    try {
      await this.products.setVariantCustomRecipe(this.store.productId(), variantId, customRecipe);
      this.notify.success(
        customRecipe ? 'Déclinaison déclarée sur mesure.' : "La déclinaison n'est plus sur mesure.",
      );
    } catch (caught) {
      this.store.setVariantCustomRecipe(variantId, !customRecipe);
      this.notify.error(caught, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.busy.set(false);
    }
  }
}
