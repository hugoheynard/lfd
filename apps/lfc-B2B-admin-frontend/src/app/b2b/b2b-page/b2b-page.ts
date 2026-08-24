import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **L'espace B2B** — ce que la plateforme client vend, et à quel prix.
 *
 * Ses deux écrans vivaient dans les Réglages, entre les heures de retrait et la
 * facturation. Ils n'y étaient pas à leur place : on ne va pas dans les réglages
 * pour travailler, on y va pour paramétrer une fois — alors que le catalogue et
 * la tarification B2B se regardent et se reprennent tous les jours. Rangés là,
 * ils se disaient plus petits que ce qu'ils sont.
 *
 * Comme le PIM, l'espace occupe le deuxième étage de la navigation de fold —
 * app → espace de travail → vues en page. Ses vues vivent dans le CATALOGUE et
 * non ici : le lanceur mobile en a besoin alors même qu'on n'y est pas.
 */
@Component({
  selector: 'app-b2b-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class B2bPage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('b2b'));
  }
}
