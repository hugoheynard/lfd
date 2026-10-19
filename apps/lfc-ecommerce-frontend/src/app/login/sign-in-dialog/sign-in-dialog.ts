import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../client/copy/client-copy.service';
import { dialogSide } from '../../client/panel-side';
import { SignInChoices } from '../sign-in-choices/sign-in-choices';

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
 * Il est **facultatif** : la façade le passe en `login_hint` pour préremplir
 * l'écran d'Auth0 — celui du code comme celui du mot de passe. Le laisser vide mène au même endroit, avec un champ à
 * remplir de plus. Le bouton ne se désarme donc jamais — exiger une adresse
 * pour un champ qui ne sert qu'à en éviter la saisie serait absurde.
 */
@Component({
  selector: 'app-sign-in-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, SignInChoices],
  templateUrl: './sign-in-dialog.html',
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
  private readonly ref = inject(FoldPanelRef);

  /** Partir chez Auth0 referme le dialogue ; la croix de l'en-tête, elle, est à fold. */
  protected close(): void {
    this.ref.close();
  }
}

/** Ce que l'ouvrant transmet : la destination, et l'adresse déjà saisie s'il y en a une. */
export interface SignInIntent {
  readonly target: string;
  readonly email: string;
}
