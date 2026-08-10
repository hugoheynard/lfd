import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldButtonComponent } from 'fold-ng';

import { StaffAuth } from '../staff-auth';

/**
 * La **porte d'entrée** du back-office en standalone.
 *
 * Pas une route mais un écran plein qui **remplace** la coquille : il n'y a rien
 * à naviguer tant que personne n'est identifié, et un rail de menu derrière un
 * formulaire de connexion invite à cliquer sur des liens qui échoueront tous.
 *
 * L'adresse demandée est conservée et restaurée au retour d'Auth0 (cf.
 * `StaffAuth`) : un lien profond partagé entre commerciaux survit à la connexion.
 */
@Component({
  selector: 'app-staff-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './staff-login.html',
  styleUrl: './staff-login.scss',
})
export class StaffLoginPage {
  private readonly auth = inject(StaffAuth);
  private readonly router = inject(Router);

  protected login(): void {
    this.auth.login(this.router.url);
  }
}
