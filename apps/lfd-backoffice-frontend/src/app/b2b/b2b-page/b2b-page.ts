import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace B2B** — la coquille des pages `b2b/*`.
 *
 * Comme le PIM, l'espace occupe le deuxième étage de la navigation de fold —
 * app → espace de travail → vues en page. Ses vues vivent dans le CATALOGUE et
 * non ici : le lanceur mobile en a besoin alors même qu'on n'y est pas.
 *
 * Le bandeau d'arrivée qu'elle portait (« le référentiel a livré N
 * changements ») est parti en X2 (2026-10-17) avec la boîte de réception : les
 * faits du catalogue s'appliquent fiche par fiche, rien n'attend plus d'être
 * relu en bloc.
 */
@Component({
  selector: 'app-b2b-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './b2b-page.html',
})
export class B2bPage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('b2b'));
  }
}
