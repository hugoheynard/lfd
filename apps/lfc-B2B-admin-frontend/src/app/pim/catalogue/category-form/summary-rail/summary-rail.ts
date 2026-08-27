import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';

import { LOCALES } from '@lfd/pim-contracts';

import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { LOCALE_NAMES } from '../../../../shared/lang-switch/locale-names';
import { PointOfSaleStore } from '../../../points-of-sale/point-of-sale-store';
import { CategoryFormStore } from '../category-form-store';

/**
 * Le rail droit d'une famille — ce qu'elle PÈSE, et le seul geste irréversible.
 *
 * Il n'y a pas de rail « Publication » ici, et c'est délibéré : une famille n'a
 * pas de statut brouillon/publié, seulement un archivage. Reproduire le rail du
 * produit aurait posé un cycle de vie qui n'existe pas.
 */
@Component({
  selector: 'app-category-summary-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldStatusBadgeComponent,
    FoldDangerZoneComponent,
  ],
  templateUrl: './summary-rail.html',
  styleUrl: './summary-rail.scss',
})
export class CategorySummaryRail {
  protected readonly store = inject(CategoryFormStore);
  private readonly points = inject(PointOfSaleStore);

  /** L'archivage demandé — la page navigue, le rail ne connaît pas la route. */
  readonly archived = output<void>();

  protected readonly ficheLabel = computed(() => {
    const count = this.store.activeProducts();
    return count === 0 ? 'Aucune fiche' : `${String(count)} fiche(s)`;
  });

  /** Les points de vente qui vendent cette famille, quel que soit le contexte. */
  protected readonly sellingPoints = computed(() => {
    const ids = new Set(this.store.channels().map((channel) => channel.pointOfSaleId));
    return this.points.items().filter((point) => ids.has(point.id));
  });

  /** Les langues encore à remplir, nommées. Vide = tout est traduit. */
  protected readonly missingNames = computed(() =>
    LOCALES.filter((locale) => this.store.name.missing().includes(locale)).map(
      (locale) => LOCALE_NAMES[locale],
    ),
  );

  /**
   * Le référentiel refuse d'archiver une famille qui porte des fiches. Sans
   * action proposée, la zone dangereuse reste un cadre qui EXPLIQUE — elle
   * n'offre pas un bouton dont on sait qu'il échouera.
   */
  protected readonly canArchive = computed(() => this.store.activeProducts() === 0);
}
