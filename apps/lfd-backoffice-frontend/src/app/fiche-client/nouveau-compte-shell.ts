import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldButtonComponent, FoldPageLayoutComponent } from 'fold-ng';

import { InformationsPage } from './informations/informations-page';

/**
 * La coquille d'un compte **qu'on ouvre** : le même chrome que la fiche, moins
 * ce qui ne peut pas encore exister.
 *
 * Pas de rail de vues : commandes, alertes et données d'une société qui n'existe
 * pas seraient des onglets menant à des écrans vides. Pas d'épingle non plus —
 * on n'épingle pas un compte qu'on n'a pas encore ouvert. Le reste, c'est
 * exactement la vue Informations, qui sait se rendre vide.
 */
@Component({
  selector: 'app-nouveau-compte-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, InformationsPage],
  template: `
    <fold-page-layout icon="company" title="Nouveau compte client">
      <button
        pageActions
        foldButton
        emphasis="outline"
        size="sm"
        icon="chevron-left"
        (click)="back()"
      >
        Retour
      </button>

      <app-informations-page />
    </fold-page-layout>
  `,
})
export class NouveauCompteShell {
  private readonly router = inject(Router);

  protected async back(): Promise<void> {
    await this.router.navigate(['/commercial/comptes-clients']);
  }
}
