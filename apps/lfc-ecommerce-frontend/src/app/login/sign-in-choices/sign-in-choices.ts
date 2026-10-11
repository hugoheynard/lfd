import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FoldButtonComponent, FoldInputComponent } from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { ClientFeatureAccess } from '../../client/feature-access/client-feature-access.service';
import { RuleOu } from '../accueil-page/rule-ou/rule-ou';

/**
 * **Les méthodes de connexion**, sans cadre : fournisseurs, adresse, mot de
 * passe, et le bouton qui part chez Auth0.
 *
 * Sortie du dialogue de connexion le 2026-10-11 pour que le panier la pose
 * DANS sa carte « Qui passe cette commande ? » (Hugo : « Me connecter devrait
 * remplacer le formulaire par la connexion ») — un second dialogue empilé sur
 * le panier aurait été le détour que la carte supprime. Le dialogue
 * ({@link SignInDialog}) n'y ajoute que son en-tête et « Annuler ».
 *
 * ⚠️ **Elle ne connecte personne** : chaque geste part chez Auth0 par une
 * redirection, l'authentification a lieu là-bas. L'adresse est FACULTATIVE —
 * elle ne sert qu'à préremplir l'écran d'Auth0 (`login_hint`) —, et le bouton
 * ne se désarme donc jamais.
 */
@Component({
  selector: 'app-sign-in-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldInputComponent, RuleOu],
  templateUrl: './sign-in-choices.html',
  styleUrl: './sign-in-choices.scss',
})
export class SignInChoices {
  /** Où revenir une fois connecté. */
  readonly target = input.required<string>();
  /** Une adresse déjà connue, pour préremplir le champ. */
  readonly email = input('');
  /** Émis juste AVANT de partir chez Auth0 — un dialogue s'y referme. */
  readonly leaving = output();

  protected readonly t = inject(ClientCopyService).t;
  protected readonly facebookShown = inject(ClientFeatureAccess).facebookLoginShown;
  private readonly auth = inject(AuthFacade);

  /** `linkedSignal` : un `input` n'est pas lisible au constructeur. */
  protected readonly typed = linkedSignal(() => this.email());

  protected withEmail(): void {
    const hint = this.hint();
    this.leaving.emit();
    this.auth.continueWithEmailCode(this.target(), hint);
  }

  protected withPassword(): void {
    const hint = this.hint();
    this.leaving.emit();
    this.auth.loginWithPassword(this.target(), hint);
  }

  protected withGoogle(): void {
    this.leaving.emit();
    this.auth.continueWithGoogle(this.target());
  }

  protected withFacebook(): void {
    this.leaving.emit();
    this.auth.continueWithFacebook(this.target());
  }

  /** Une adresse vide, ou faite de blancs, ne devient pas un indice. */
  private hint(): string | undefined {
    const typed = this.typed().trim();
    return typed === '' ? undefined : typed;
  }
}
