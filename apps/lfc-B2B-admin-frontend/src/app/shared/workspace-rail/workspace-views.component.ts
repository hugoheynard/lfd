import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input } from '@angular/core';
import { FoldViewNavComponent } from 'fold-ng';

import { narrowViewport } from '../viewport/narrow-viewport';
import { WorkspaceRailStore } from './workspace-rail.store';

/**
 * Le seuil où `fold-app-shell` retire ses DEUX rails et ne ramène que le
 * primaire (son `MOBILE_BREAKPOINT`). Écrit une seule fois : deux navigations
 * qui basculent à deux pixels différents laisseraient une bande où l'on n'a ni
 * l'une ni l'autre.
 */
const SHELL_RAILS_DROP = 768;

/**
 * Les vues de l'espace de travail **quand la coquille n'a plus de rail**.
 *
 * En large, elles vivent dans le rail secondaire, rendu par la racine. Sous
 * 768px ce rail n'existe plus — la coquille les retire tous les deux et ne
 * ramène que le primaire, en lanceur de tuiles. Sans cette reprise, les vues
 * d'un espace deviendraient injoignables au téléphone.
 *
 * Une navigation, deux rendus, jamais les deux à la fois : les items viennent
 * du même store que le rail, donc une vue ajoutée ou refusée par les droits
 * apparaît et disparaît des deux côtés sans qu'on y touche.
 */
@Component({
  selector: 'app-workspace-views',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  template: `
    @if (narrow()) {
      @if (rail(); as ws) {
        <fold-view-nav
          [items]="ws.items"
          collapsed
          size="comfortable"
          activeStyle="underline"
          background="transparent"
        />
      }
    }
  `,
  styleUrl: './workspace-views.component.scss',
  host: {
    '[class.has-gutter]': 'gutter()',
    // Sans ce drapeau, l'hôte garderait ses marges en large — une bande vide
    // au-dessus de chaque vue, pour une barre qui n'est pas rendue.
    '[class.is-live]': 'narrow() && rail() !== null',
  },
})
export class WorkspaceViewsComponent {
  /**
   * Poser la gouttière de page ?
   *
   * Non par défaut : la barre vit d'ordinaire DANS un `fold-page-layout`, qui a
   * déjà posé la sienne — l'ajouter décalerait la barre du titre juste
   * au-dessus. Le PIM, lui, n'en a pas (chaque vue porte le sien), et c'est
   * alors à la barre de la poser.
   */
  readonly gutter = input(false, { transform: booleanAttribute });

  protected readonly rail = inject(WorkspaceRailStore).rail;
  protected readonly narrow = narrowViewport(SHELL_RAILS_DROP);
}
