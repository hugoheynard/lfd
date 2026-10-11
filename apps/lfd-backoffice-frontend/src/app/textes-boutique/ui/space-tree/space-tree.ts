import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSeparatorComponent,
  type FoldMenuItemBadgeTone,
} from 'fold-ng';

import type { SpaceNode } from '../../rules/space-tree';
import { CopyNavigation } from '../../state/copy-navigation';

/** La pastille d'un espace : la plus pressante des trois, et son ton. */
export interface SpaceBadge {
  readonly text: string;
  readonly tone: FoldMenuItemBadgeTone;
}

/**
 * Une seule pastille par espace — l'entrée de menu fold n'en porte qu'une.
 * Ordre : ce qui attend Publier, puis une traduction en retard, puis ce que la
 * boutique sert déjà modifié.
 */
export function spaceBadge(node: SpaceNode): SpaceBadge | null {
  if (node.pending > 0) {
    return { text: `${node.pending} à publier`, tone: 'warning' };
  }
  if (node.stale > 0) {
    return {
      text: `${node.stale} traduction${node.stale > 1 ? 's' : ''} en retard`,
      tone: 'alert',
    };
  }
  if (node.modified > 0) {
    return { text: `${node.modified} modifié${node.modified > 1 ? 's' : ''}`, tone: 'info' };
  }
  return null;
}

/**
 * **Les espaces** (plan §7, colonne 1) — l'arbre dans l'ordre du recueil, le
 * parcours de commande d'abord ; et le filtre « seulement ce que l'aperçu
 * montre », ouvert dès que l'aperçu a dit ce qu'il affiche.
 */
@Component({
  selector: 'app-space-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldMenuSeparatorComponent,
  ],
  templateUrl: './space-tree.html',
  styleUrl: './space-tree.scss',
})
export class SpaceTree {
  protected readonly navigation = inject(CopyNavigation);

  protected readonly journey = computed(() =>
    this.navigation.tree().filter((node) => node.journey),
  );
  protected readonly others = computed(() =>
    this.navigation.tree().filter((node) => !node.journey),
  );

  protected readonly badge = spaceBadge;
}
