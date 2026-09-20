import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { FoldBadgeComponent, FoldDisclosureComponent } from 'fold-ng';

import { familyCount, type CollectionFamily } from '../collections';

/**
 * Arbre présentationnel des collections — trois lectures des tags, descendant
 * jusqu'aux fiches. Purement piloté par son `families` : l'hôte décide de la
 * source (tout le généré, ou seulement la segmentation web visible).
 */
@Component({
  selector: 'app-collections-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDisclosureComponent, FoldBadgeComponent],
  templateUrl: './collections-tree.html',
  styleUrl: './collections-tree.scss',
})
export class CollectionsTree {
  readonly families = input.required<CollectionFamily[]>();

  protected count(family: CollectionFamily): number {
    return familyCount(family);
  }
}
