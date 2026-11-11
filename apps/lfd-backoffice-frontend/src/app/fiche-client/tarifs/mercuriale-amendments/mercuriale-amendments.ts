import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  CompanyPricingCategoryView,
  PosedMercurialeAmendmentView,
  PosedMercurialeView,
  PromotionView,
} from '@lfd/contracts';
import { FoldElementTitleComponent } from 'fold-ng';

import { amendmentLine } from './amendment-lines';
import { discountNames } from '../general-discount';

/**
 * **Les avenants passés d'une mercuriale**, en lecture, sous sa grille : quand,
 * ce qu'ils ouvrent et arrêtent, le motif et l'auteur.
 *
 * Écrire un avenant se fait dans la table (« Modifier par avenant »,
 * `MercurialeAmendment`), en un seul avenant pour tous les changements.
 */
@Component({
  selector: 'app-mercuriale-amendments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldElementTitleComponent],
  templateUrl: './mercuriale-amendments.html',
  styleUrl: './mercuriale-amendments.scss',
})
export class MercurialeAmendments {
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();
  /** Les promotions, pour nommer celles d'un « Au choix » ; `null` = illisibles. */
  readonly promotions = input<readonly PromotionView[] | null>(null);

  protected readonly amendments = computed<readonly PosedMercurialeAmendmentView[]>(
    () => this.mercuriale().amendments ?? [],
  );
  private readonly names = computed(() => discountNames(this.categories()));

  protected lineOf(amendment: PosedMercurialeAmendmentView): string {
    return amendmentLine(amendment, this.promotions(), this.names());
  }
}
