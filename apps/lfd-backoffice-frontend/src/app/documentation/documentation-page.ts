import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { provideWorkspaceRail } from '../shared/workspace-rail/workspace-rail.store';
import { WorkspaceCatalogue } from '../shared/workspace-rail/workspaces';

/**
 * **La documentation**, espace de travail du back-office.
 *
 * Elle fut une page unique à sept onglets. Ça tenait tant qu'elle ne parlait
 * que du référentiel ; le jour où il faut y expliquer le commerce, la
 * production ou les accès, une barre d'onglets n'a plus de place pour dire à
 * QUOI un texte se rapporte — d'où le rail secondaire et ses sections, le même
 * étage de navigation que le PIM et le Commercial.
 *
 * Chaque section a désormais son URL : on peut coller le lien d'une explication
 * dans une conversation, ce qu'une pile de panneaux sur la même adresse rendait
 * impossible. C'est la raison la plus terre à terre du changement, et la plus
 * utilisée.
 *
 * Ses vues vivent dans le CATALOGUE et non ici : le lanceur mobile en a besoin
 * alors même qu'on n'est pas dans la documentation, ce que la publication à
 * l'entrée ne peut pas donner.
 */
@Component({
  selector: 'app-documentation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: ':host { display: block; }',
})
export class DocumentationPage {
  private readonly catalogue = inject(WorkspaceCatalogue);

  constructor() {
    provideWorkspaceRail(this.catalogue.rail('documentation'));
  }
}
