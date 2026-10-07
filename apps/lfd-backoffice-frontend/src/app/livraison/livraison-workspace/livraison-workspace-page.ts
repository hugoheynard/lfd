import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace Livraison** — l'exploitation de la livraison : la feuille de
 * route, la flotte, le point de départ, et bientôt les tournées
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 2).
 *
 * La coquille ne dessine rien et ne garde rien : chaque vue relève de son
 * propre droit (`delivery_run_sheet`, `delivery_settings`), et un garde ici
 * fermerait l'une des deux à qui ne tient que l'autre.
 */
@Component({
  selector: 'app-livraison-workspace-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './livraison-workspace-page.html',
  styleUrl: './livraison-workspace-page.scss',
})
export class LivraisonWorkspacePage {
  constructor() {
    provideWorkspaceRail(inject(WorkspaceCatalogue).rail('exploitation'));
  }
}
