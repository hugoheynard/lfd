import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **Contenu de plateforme**, espace du back-office.
 *
 * Il occupe le deuxième étage de la navigation de fold — app → espace de
 * travail → vues en page — pour la même raison que le PIM : c'est un contexte
 * borné entier, avec son vocabulaire et sa donnée. Les textes de la vitrine ne
 * sont pas un réglage de commerce ; les ranger dans les Réglages les aurait
 * mêlés aux zones de livraison et aux seuils d'alerte.
 *
 * La coquille ne porte AUCUNE navigation : elle publie ses vues, et c'est la
 * racine qui les rend dans le rail secondaire — groupées par section, puisque
 * cet espace-ci en déclare.
 */
@Component({
  selector: 'app-contenu-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class ContenuPage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('contenu'));
  }
}
