import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldMenuSectionComponent,
  FoldMenuSeparatorComponent,
  type FoldMenuItemBadgeTone,
} from 'fold-ng';

import type { SpaceNode } from '../../rules/space-tree';
import { CopyNavigation } from '../../state/copy-navigation';
import { PreviewLink } from '../../state/preview-link';

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
 * **Les espaces** (plan §7, colonne 1) — ce que l'aperçu montre, en direct et
 * dans l'ordre de l'écran (Hugo, 2026-10-11 : « la colonne de gauche, ça
 * devrait tout le temps être ce que l'aperçu montre »). « Voir tous les
 * textes » ouvre la liste complète de la clientèle, dans l'ordre du recueil,
 * avec les espaces que personne ne voit aujourd'hui repliés à la fin ; une
 * recherche, elle, porte toujours sur toute la clientèle.
 */
@Component({
  selector: 'app-space-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldMenuSectionComponent,
    FoldMenuSeparatorComponent,
  ],
  templateUrl: './space-tree.html',
  styleUrl: './space-tree.scss',
})
export class SpaceTree {
  protected readonly navigation = inject(CopyNavigation);
  /** Sans adresse d'aperçu, rien ne viendra : la colonne le dit et renvoie à la liste. */
  protected readonly previewAvailable = inject(PreviewLink).origin !== null;

  protected readonly journey = computed(() =>
    this.navigation.audienceTree().filter((node) => node.journey),
  );
  protected readonly others = computed(() =>
    this.navigation.audienceTree().filter((node) => !node.journey),
  );
  /** « Pas montré aujourd'hui » part replié : on y vient exprès. */
  protected readonly unshownCollapsed = signal(true);

  protected readonly badge = spaceBadge;
}
