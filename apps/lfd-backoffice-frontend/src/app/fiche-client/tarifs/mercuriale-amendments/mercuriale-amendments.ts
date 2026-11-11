import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  CompanyPricingCategoryView,
  PosedMercurialeView,
  PromotionView,
} from '@lfd/contracts';
import { FoldElementTitleComponent, FoldTimelineComponent, type FoldTimelineNode } from 'fold-ng';

import { amendmentEntry, type AmendmentEntry } from './amendment-lines';
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
  imports: [FoldElementTitleComponent, FoldTimelineComponent],
  templateUrl: './mercuriale-amendments.html',
  styleUrl: './mercuriale-amendments.scss',
})
export class MercurialeAmendments {
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();
  /** Les promotions, pour nommer celles d’un « Seulement celles choisies » ; `null` = illisibles. */
  readonly promotions = input<readonly PromotionView[] | null>(null);

  private readonly names = computed(() => discountNames(this.categories()));

  /** Les avenants, du plus ancien au plus récent, en entrées lisibles. */
  protected readonly entries = computed<readonly AmendmentEntry[]>(() =>
    [...(this.mercuriale().amendments ?? [])]
      .sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime())
      .map((amendment) => amendmentEntry(amendment, this.promotions(), this.names())),
  );

  /** Un nœud par avenant : tout son contenu dans le gabarit. */
  protected readonly nodes = computed<readonly FoldTimelineNode[]>(() =>
    this.entries().map((entry) => ({
      key: entry.key,
      id: null,
      clickable: false,
      label: entry.period,
      variant: 'hollow',
    })),
  );

  private readonly byKey = computed(
    () => new Map(this.entries().map((entry) => [entry.key, entry] as const)),
  );

  protected entryOf(key: string): AmendmentEntry | undefined {
    return this.byKey().get(key);
  }
}
