import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CatalogueAudience } from '@lfd/pim-contracts';
import { FoldCalloutComponent, FoldListboxComponent } from 'fold-ng';

import { NotifyService } from '../../../../../notify.service';
import {
  audienceLabel,
  FOLLOW_PRODUCT,
  variantAudienceOptions,
  type VariantAudienceChoice,
} from '../../../audience/audience-options';
import { ProductHttpApi } from '../../../product-http-api';
import { ProductFormStore } from '../../product-form-store';

/** La raison du sélecteur grisé (A3) : le geste demande les vignettes. */
export const VARIANT_AUDIENCE_NEEDS_TILES =
  'Cochez « Montrer chaque déclinaison » pour régler l’audience d’une déclinaison.';

/**
 * **À qui la déclinaison ouverte vend** (`plan-audience-par-declinaison.md`,
 * Q2) : elle suit sa fiche, ou y déroge. Le défaut n'a pas d'audience propre
 * (A2) — l'audience de la fiche est la sienne, le sélecteur ne s'y montre pas.
 *
 * Elle écrit tout de suite sur sa propre route, hors de « Tout enregistrer »,
 * comme la case « Sur mesure ». Un refus remet le choix où il était et affiche
 * le message du serveur.
 */
@Component({
  selector: 'app-variant-audience-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldListboxComponent],
  templateUrl: './variant-audience-form.html',
})
export class VariantAudienceForm {
  private readonly products = inject(ProductHttpApi);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(ProductFormStore);

  protected readonly busy = signal(false);

  private readonly variant = computed(() =>
    this.store.variants().find((entry) => entry.id === this.store.selectedVariantId()),
  );

  protected readonly isDefault = computed(() => this.variant()?.isDefault ?? true);

  /** Sans vignettes, une déclinaison ne paraît pas seule : pas d'audience propre (A3). */
  protected readonly needsTiles = computed(() => !this.store.variantsAsTiles());

  protected readonly options = computed(() => variantAudienceOptions(this.productAudience()));

  protected readonly choice = computed<VariantAudienceChoice>(
    () => this.variant()?.audience ?? FOLLOW_PRODUCT,
  );

  /** L'audience que la fiche sert réellement (la sienne, ou celle de sa famille). */
  private readonly productAudience = computed<CatalogueAudience | null>(
    () => this.store.audience() ?? this.store.familyAudience(),
  );

  /** « (Pros) » — vide tant que l'audience de la fiche n'est pas connue. */
  protected readonly productAudienceSuffix = computed(() => {
    const audience = this.productAudience();
    return audience === null ? '' : ` (${audienceLabel(audience)})`;
  });

  /** L'audience propre de la déclinaison, nommée ; `null` quand elle suit la fiche. */
  protected readonly ownAudienceLabel = computed(() => {
    const own = this.variant()?.audience ?? null;
    return own === null ? null : audienceLabel(own);
  });

  protected readonly hint = computed(() =>
    this.needsTiles()
      ? VARIANT_AUDIENCE_NEEDS_TILES
      : 'Suivre la fiche, ou vendre cette déclinaison à une autre clientèle.',
  );

  protected async onChange(choice: VariantAudienceChoice): Promise<void> {
    const variant = this.variant();
    if (variant === undefined || variant.isDefault) {
      return;
    }
    const next: CatalogueAudience | null = choice === FOLLOW_PRODUCT ? null : choice;
    const previous = variant.audience;
    if (next === previous) {
      return;
    }
    this.store.setVariantAudience(variant.id, next);
    this.busy.set(true);
    try {
      await this.products.setVariantAudience(this.store.productId(), variant.id, next);
      this.notify.success(
        next === null
          ? "La déclinaison suit l'audience de sa fiche."
          : 'Audience de la déclinaison enregistrée.',
      );
    } catch (caught) {
      this.store.setVariantAudience(variant.id, previous);
      this.notify.error(caught, "L'audience n'a pas pu être enregistrée.");
    } finally {
      this.busy.set(false);
    }
  }
}
