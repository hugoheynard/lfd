import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

/**
 * Réglages de l'espace B2B. Aujourd'hui : la session (déconnexion). Les
 * préférences de compte viendront s'ajouter quand le backend existera.
 */
@Component({
  selector: 'app-reglages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldButtonComponent,
  ],
  templateUrl: './reglages-page.html',
  styleUrl: './reglages-page.scss',
})
export class ReglagesPage {
  private readonly router = inject(Router);

  /**
   * Déconnexion. L'auth n'est pas encore câblée : on revient au tableau de bord.
   * Le vrai flux (purge du jeton + redirection login) se branchera ici.
   */
  protected logout(): void {
    void this.router.navigateByUrl('/');
  }
}
