import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace de travail du fournil** — la coquille qui publie son rail.
 *
 * Elle ne dessine rien : ni bandeau, ni titre, ni onglet. C'est une différence
 * assumée avec le poste commercial, dont la coquille porte l'en-tête commun à
 * ses cinq vues. Ici les deux vues ont des sommets qui n'ont rien à voir — la
 * journée choisit une date et imprime un dossier, le prévisionnel déplace une
 * fenêtre de sept jours —, et un en-tête commun aurait dû être vidé de tout ce
 * qui les distingue pour n'être qu'un mot déjà écrit dans le rail.
 *
 * Son seul travail est donc `provideWorkspaceRail` : publier les vues à
 * l'entrée, les effacer à la sortie. La racine rend le rail, et n'a jamais à
 * savoir ce que la production contient.
 *
 * ⚠️ **Elle n'est pas une page** : aucun `fold-page-layout` ici, chaque vue
 * porte le sien. Deux layouts imbriqués empileraient deux fois les gouttières
 * et les plafonds de largeur.
 */
@Component({
  selector: 'app-production-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class ProductionWorkspacePage {
  constructor() {
    provideWorkspaceRail(inject(WorkspaceCatalogue).rail('production'));
  }
}
