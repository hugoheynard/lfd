import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FoldButtonComponent, FoldPanelHostService, FoldSpinnerComponent } from 'fold-ng';

import { AuthFacade } from '../auth/auth.facade';
import { SignInDialog } from './sign-in-dialog/sign-in-dialog';

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
  private readonly panels = inject(FoldPanelHostService);

  /** Route à rejoindre après connexion (deep-link préservé par le guard). */
  private readonly returnTo = this.route.snapshot.queryParamMap.get('returnTo') ?? '/';

  constructor() {
    effect(() => {
      if (this.facade.isAuthenticated()) {
        void this.router.navigateByUrl(this.returnTo);
      }
    });
  }

  /**
   * Ouvre le dialogue des méthodes plutôt que de partir droit chez Auth0.
   *
   * 🔴 Le bouton redirigeait sans rien annoncer (Hugo, 2026-09-22). Qui a ouvert
   * son compte par Google se retrouvait devant un formulaire de mot de passe
   * qu'il n'a jamais posé, sans que rien à l'écran ne dise que l'autre chemin
   * existe. Le dialogue met les méthodes sous les yeux AVANT de sortir de
   * l'app ; c'est lui qui redirige ensuite.
   */
  protected signIn(): void {
    SignInDialog.open(this.panels, this.returnTo);
  }

  /** Ouvre l'onglet inscription de l'Universal Login (création de compte). */
  protected signUp(): void {
    this.facade.register(this.returnTo);
  }
}
