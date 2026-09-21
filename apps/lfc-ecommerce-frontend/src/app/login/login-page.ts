import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FoldButtonComponent, FoldSpinnerComponent } from 'fold-ng';

import { AuthFacade } from '../auth/auth.facade';

/**
 * Page de connexion — la seule route **publique** de l'espace pro.
 *
 * Flux : bouton « Se connecter » → redirection Auth0 (Universal Login) → retour
 * ici avec une session ; l'`effect` détecte l'authentification et renvoie vers
 * `returnTo` (la route profonde que le guard avait mémorisée, sinon le tableau
 * de bord). Un utilisateur déjà connecté qui atterrit ici est aussi redirigé.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldSpinnerComponent],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly facade = inject(AuthFacade);

  /** Route à rejoindre après connexion (deep-link préservé par le guard). */
  private readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo') ?? '/';

  constructor() {
    effect(() => {
      if (this.facade.isAuthenticated()) {
        void this.router.navigateByUrl(this.returnTo);
      }
    });
  }

  protected signIn(): void {
    this.facade.login(this.returnTo);
  }

  /** Ouvre l'onglet inscription de l'Universal Login (création de compte). */
  protected signUp(): void {
    this.facade.register(this.returnTo);
  }
}
