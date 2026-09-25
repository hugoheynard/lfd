import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace de travail du comptoir** — la coquille qui publie son rail.
 *
 * Même motif que la production : elle ne dessine rien, parce que ses deux vues
 * n'ont pas de sommet commun — la file de retrait vit du jour, la commande pro
 * commence par une recherche de compte. Son seul travail est de publier les
 * vues à l'entrée et de les effacer à la sortie.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien — deux layouts imbriqués empileraient les gouttières.
 */
@Component({
  selector: 'app-comptoir-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './comptoir-workspace-page.html',
  styleUrl: './comptoir-workspace-page.scss',
})
export class ComptoirWorkspacePage {
  constructor() {
    provideWorkspaceRail(inject(WorkspaceCatalogue).rail('comptoir'));
  }
}
