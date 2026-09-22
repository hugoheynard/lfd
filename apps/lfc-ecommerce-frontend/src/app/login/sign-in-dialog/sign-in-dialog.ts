import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { dialogSide } from '../../client/panel-side';
import { RuleOu } from '../accueil-page/rule-ou/rule-ou';

/**
 * **Se connecter** — les méthodes réunies dans un dialogue.
 *
 * ## Pourquoi il existe
 *
 * 🔴 Se connecter n'avait **pas d'écran à soi** (Hugo, 2026-09-22 : « quand je
 * fais me connecter j'arrive sur la page inscription », puis « là je n'ai que
 * créer mon compte »). L'accueil montre une carte d'INSCRIPTION — prénom,
 * téléphone, e-mail, « ouvrir mon compte » — et la porte « Déjà client ? »
 * n'apparaît qu'en pile : `welcome-step.html` la pose en `only-narrow`. Au
 * bureau, la seule chose qu'on lisait était donc la création de compte.
 *
 * Le geste partait ensuite **droit chez Auth0**, sans que rien chez nous n'ait
 * annoncé les méthodes possibles. Ce dialogue les réunit au même endroit, et
 * fait de « se connecter » une décision prise **ici**, avant de sortir de
 * l'app.
 *
 * ## Ce qu'il ne fait pas, et c'est délibéré
 *
 * ⚠️ **Il ne connecte personne.** Chaque bouton part chez Auth0 par une
 * redirection ; l'authentification a lieu là-bas. Le dialogue ne porte donc ni
 * mot de passe, ni état de chargement, ni refus : il n'y a rien à refuser
 * puisqu'il n'y a pas d'appel. C'est ce qui le distingue des autres dialogues
 * de saisie de l'app, dont le `CLAUDE.md` dit qu'un refus du serveur doit y
 * rester — ici, le refus n'a pas lieu chez nous.
 *
 * ⚠️ **Il ne sait pas quelles méthodes VOUS concernent.** Elles dépendent de ce
 * qui est rattaché au compte, et nous ne le savons pas avant d'être connecté.
 * Les trois chemins sont donc proposés à tout le monde, et la phrase
 * d'introduction invite à reprendre **celui qu'on a choisi**, plutôt que
 * d'affirmer qu'ils marcheront tous.
 *
 * ## L'e-mail n'est pas un identifiant, c'est un raccourci
 *
 * Il est **facultatif** : `login()` le passe en `login_hint` pour préremplir
 * l'écran d'Auth0. Le laisser vide mène au même endroit, avec un champ à
 * remplir de plus. Le bouton ne se désarme donc jamais — exiger une adresse
 * pour un champ qui ne sert qu'à en éviter la saisie serait absurde.
 */
@Component({
  selector: 'app-sign-in-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    RuleOu,
  ],
  templateUrl: './sign-in-dialog.html',
  styleUrl: './sign-in-dialog.scss',
})
export class SignInDialog {
  /** `sm` : deux boutons et un champ — plus large, le dialogue serait vide. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'sm', surface: 'solid' };

  /**
   * Ouvre le dialogue sur la destination d'après-connexion.
   *
   * Le côté se lit **au clic** (`dialogSide()`), jamais en signal : ouvrir est
   * un geste, et c'est la largeur de ce moment-là qui décide entre le dialogue
   * centré et la feuille du bas (`CLAUDE.md` de l'app, règle « Saisir »).
   */
  static open(panels: FoldPanelHostService, target: string, email = ''): FoldPanelRef<void> {
    return panels.open<SignInIntent, void>(SignInDialog, {
      side: dialogSide(),
      data: { target, email },
    });
  }

  /** Ce que l'ouvrant sait déjà : où revenir, et l'adresse éventuellement tapée. */
  readonly data = input.required<SignInIntent>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly auth = inject(AuthFacade);
  private readonly ref = inject(FoldPanelRef);

  /**
   * Le champ part de ce qui a déjà été tapé sur l'accueil, s'il y a lieu.
   *
   * `linkedSignal` et non `signal(this.data().email)` : un `input` n'est pas
   * lisible à la construction, et le lire là rendrait une valeur vide pour
   * toujours.
   */
  protected readonly email = linkedSignal(() => this.data().email);

  protected setEmail(value: string): void {
    this.email.set(value);
  }

  /**
   * Le chemin par e-mail : Auth0 reconnaîtra la passkey ou demandera le mot de
   * passe. On ferme AVANT de rediriger — la page va disparaître, et un
   * dialogue laissé ouvert se retrouverait à l'écran au retour.
   */
  protected withEmail(): void {
    const { target } = this.data();
    const hint = this.email().trim();
    this.ref.close();
    this.auth.login(target, hint === '' ? undefined : hint);
  }

  protected withGoogle(): void {
    const { target } = this.data();
    this.ref.close();
    this.auth.continueWithGoogle(target);
  }

  protected withFacebook(): void {
    const { target } = this.data();
    this.ref.close();
    this.auth.continueWithFacebook(target);
  }

  protected cancel(): void {
    this.ref.close();
  }
}

/** Ce que l'ouvrant transmet : la destination, et l'adresse déjà saisie s'il y en a une. */
export interface SignInIntent {
  readonly target: string;
  readonly email: string;
}
