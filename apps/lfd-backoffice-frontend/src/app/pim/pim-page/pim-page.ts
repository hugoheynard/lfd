import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../../shared/workspace-rail/workspaces';

/**
 * **Le PIM**, section du back-office.
 *
 * Il fut une application à part, ouverte en iframe dans le shell. Ce qui le
 * justifiait est tombé pièce par pièce — son backend, son audience, sa base —
 * et ce qui restait n'était plus une frontière mais de la duplication.
 *
 * Le PIM occupe le deuxième étage de la navigation de fold — app → espace de
 * travail → vues en page — parce que c'est un contexte borné entier : son
 * vocabulaire, ses sept vues, sa donnée. Rendu en barre d'onglets dans une
 * page, il se disait plus petit que ce qu'il est.
 *
 * Ses vues vivent dans le CATALOGUE et non ici : le lanceur mobile en a besoin
 * alors même qu'on n'est pas dans le PIM, ce que la publication à l'entrée ne
 * peut pas donner.
 *
 * La coquille ne porte plus AUCUNE navigation en large : elle publie ses vues,
 * et c'est la racine qui les rend dans le rail secondaire. Ce qui reste ici est
 * la reprise étroite, et le `router-outlet`. Rien à calculer sur l'URL — les
 * deux rendus font de vrais `<a routerLink>` et tiennent l'état actif seuls.
 */
@Component({
  selector: 'app-pim-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './pim-page.html',
  styleUrl: './pim-page.scss',
})
export class PimPage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('pim'));
  }
}
