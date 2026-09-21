import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
} from 'fold-ng';

import { AuthFacade } from '../auth.facade';

/** Où renvoyer qui arrive ici sans inscription en cours. */
const PRO_DOOR = '/ouverture-compte-pro';

/**
 * **L'écran d'inscription d'Auth0, SIMULÉ** — en développement seulement.
 *
 * En production, « Créer mon compte pro » part sur l'Universal Login d'Auth0 :
 * la personne y choisit son mot de passe, revient sur Mon compte, et Auth0 lui
 * envoie un e-mail de vérification d'adresse. En dev, le contournement
 * d'authentification sautait les deux gestes, et le parcours qu'on éprouvait
 * n'était pas celui du client (relevé le 2026-09-14).
 *
 * Rien ne part : le mot de passe n'est ni envoyé ni gardé, et l'e-mail n'est
 * pas envoyé — l'écran le DIT. La route n'existe pas au build de production
 * (`app.routes.ts`, `DEV_BYPASS_AUTH`).
 *
 * ⚠️ Texte en dur, en français : un outil de développement, que personne ne lit
 * dans une autre langue.
 */
@Component({
  selector: 'app-dev-auth0-signup-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
  ],
  templateUrl: './dev-auth0-signup-page.html',
  styleUrl: './dev-auth0-signup-page.scss',
})
export class DevAuth0SignupPage {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  /** L'inscription en cours, lue une fois : un rechargement la perd, comme en vrai. */
  protected readonly signup = this.auth.devSignup;

  protected readonly email = computed(() => this.signup()?.registration.email ?? '');

  /** Saisi pour le geste, jamais lu au-delà de « est-il rempli ? ». */
  protected readonly password = signal('');

  /** Le mot de passe est « posé » : l'e-mail de vérification est parti (simulé). */
  protected readonly sent = signal(false);

  protected createAccount(): void {
    if (this.password().trim() !== '') {
      this.password.set('');
      this.sent.set(true);
    }
  }

  protected continueToAccount(): void {
    const target = this.auth.completeDevSignup();
    void this.router.navigateByUrl(target ?? PRO_DOOR);
  }

  protected backToDoor(): void {
    void this.router.navigateByUrl(PRO_DOOR);
  }
}
