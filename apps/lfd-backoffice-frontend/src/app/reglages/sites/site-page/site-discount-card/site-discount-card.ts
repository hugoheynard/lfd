import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import type { CustomerAudience, SiteView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { CatalogueService } from '../../../../b2b/catalogue/catalogue.service';
import { discountCatalogueOf, type DiscountCatalogue } from '../../pickup-discount-rules';
import { AudienceDiscountCard } from '../audience-discount-card/audience-discount-card';

/**
 * **Les réductions de retrait d'un site** — une sous-carte de « Paramétrage du
 * retrait », qui porte DEUX cartes, « Pros » et « Particuliers » (lot B du plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md`). Chacune a sa
 * sauvegarde.
 *
 * Elle lit le catalogue publié (`GET admin/catalog/published`) une fois pour
 * les deux : ses familles et ses produits sont ce que les règles visent, et
 * sans lui une règle ne se nomme pas.
 */
@Component({
  selector: 'app-site-discount-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AudienceDiscountCard,
    FoldButtonComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './site-discount-card.html',
  styleUrl: './site-discount-card.scss',
})
export class SiteDiscountCard {
  private readonly catalogueService = inject(CatalogueService);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);
  readonly saved = output();

  protected readonly audiences: readonly CustomerAudience[] = ['b2b', 'b2c'];
  protected readonly catalogue = signal<DiscountCatalogue | null>(null);
  protected readonly loadError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.catalogue.set(discountCatalogueOf(await this.catalogueService.published()));
    } catch (error) {
      this.loadError.set(httpErrorMessage(error, "Le catalogue publié n'a pas pu être lu."));
    }
  }
}
