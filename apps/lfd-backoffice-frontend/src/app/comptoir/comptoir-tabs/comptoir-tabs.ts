import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FoldViewNavComponent } from 'fold-ng';

import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **Les onglets du comptoir** — Nouvelle commande, Retrait, Réassort.
 *
 * Posés PAR CHAQUE VUE, pas par l'espace (Hugo, 2026-10-12) : au-dessus de
 * tout, ils repoussaient la bande du retrait ; le retrait les place sous son
 * sélecteur de point, les autres vues en tête de leur contenu. Lus dans
 * `COMPTOIR_VIEWS`, donc filtrés par les droits comme les tuiles du lanceur.
 */
@Component({
  selector: 'app-comptoir-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldViewNavComponent],
  template: `<fold-view-nav
    [items]="tabs()"
    direction="horizontal"
    size="comfortable"
    justify="stretch"
    activeStyle="fill"
    background="transparent"
  />`,
})
export class ComptoirTabs {
  /** Les onglets permis, dans l'ordre de `COMPTOIR_VIEWS`. */
  protected readonly tabs = inject(WorkspaceCatalogue).views('comptoir');
}
