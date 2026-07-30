import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AuthFacade } from '../auth/auth.facade';
import { ProfilSection } from './profil-section/profil-section';

/**
 * Réglages de l'espace B2B : le **profil de la personne** et la session.
 *
 * Le profil vit ici, et non dans « Mes entreprises » : c'est qui vous êtes, pas
 * une société. Les deux étaient confondus avant — le compte portait une société
 * unique, ce qui rendait impossible d'exister sans entreprise.
 */
@Component({
  selector: 'app-reglages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldButtonComponent,
    ProfilSection,
  ],
  templateUrl: './reglages-page.html',
  styleUrl: './reglages-page.scss',
})
export class ReglagesPage {
  private readonly auth = inject(AuthFacade);

  /** Déconnexion réelle (Auth0) — le guard renverra ensuite vers `/login`. */
  protected logout(): void {
    this.auth.logout();
  }
}
