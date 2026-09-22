import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldIconComponent,
  FoldPanelHostComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';
import { IdentityConflictNotice } from '../../auth/identity-conflict';
import { ClientChrome } from '../client-chrome.service';
import { AccountMenu } from './account-menu/account-menu';
import { ClientFoot } from '../foot/client-foot';
import { ClientMenu } from '../nav/client-menu/client-menu';
import { NotificationsMenu } from './notifications-menu/notifications-menu';
import { ClientBand } from '../nav/client-band/client-band';
import { ClientCartPill } from '../cart/client-cart-pill/client-cart-pill';
import { ClientOnboarding } from '../client-onboarding.service';
import { ProOnboarding } from '../pro-onboarding.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientFeatureAccess } from '../feature-access/client-feature-access.service';
import { LangSwitch } from '../lang-switch/lang-switch';

/**
 * Le shell de l'app CLIENT : la barre de marque bleue, et rien d'autre.
 *
 * Pas de rail — l'app cliente est pensée pour le téléphone, sa navigation sera
 * une nav mobile, pas une colonne de bureau. `mobileNav="none"` dit au shell de
 * ne pas préparer de tiroir qu'on ne remplira jamais.
 *
 * La barre est projetée dans le slot `[header]` du shell : c'est lui qui la
 * place, lui qui la peint (`--fold-color-bg-header`) et lui qui la marque
 * `data-surface="chrome"`. L'écran n'a donc plus à porter son propre en-tête.
 */
@Component({
  selector: 'app-client-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'lfc-app', '[class.bar-narrow-only]': '!chrome.barOnDesktop()' },
  imports: [
    AccountMenu,
    ClientBand,
    ClientCartPill,
    ClientFoot,
    ClientMenu,
    FoldAppShellComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldIconComponent,
    FoldPanelHostComponent,
    LangSwitch,
    NotificationsMenu,
    RouterLink,
    RouterOutlet,
  ],
  templateUrl: './client-shell.html',
  styleUrl: './client-shell.scss',
})
export class ClientShell {
  protected readonly chrome = inject(ClientChrome);
  private readonly copy = inject(ClientCopyService);
  protected readonly t = this.copy.t;

  /**
   * « Se connecter » dans les trois langues — pour RÉSERVER la largeur de la
   * plus longue, pas pour l'afficher.
   *
   * Le bouton ferme la rangée : sa largeur pousse la marque, le panier et le
   * sélecteur de langue. En changeant de langue on change donc la mise en page
   * de toute la barre, et le geste qu'on vient de faire — cliquer sur `IT` —
   * déplace le bouton sous le curseur qui vient de le quitter.
   *
   * Une liste et non un nombre : le jour où une traduction s'allonge, la
   * réserve s'allonge avec elle. Un `min-width` en rem serait juste jusqu'à la
   * première retouche du dictionnaire, et faux en silence ensuite.
   */
  protected readonly signInLabels = this.copy.everyLocale((copy) => copy.chrome.signIn);
  protected readonly access = inject(ClientFeatureAccess);
  protected readonly identityConflict = inject(IdentityConflictNotice);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly panels = inject(FoldPanelHostService);

  /**
   * Le bouton « Se connecter » de la barre — il **ouvre les méthodes**.
   *
   * 🔴 C'était un lien vers `/inscription` (Hugo, 2026-09-22 : « quand je fais
   * me connecter j'arrive sur la page inscription »). Un bouton qui nomme un
   * geste et dépose ailleurs ment sur sa destination ; et la page d'arrivée
   * montre d'abord la CRÉATION de compte, ce qui laisse croire qu'il n'y a pas
   * d'autre chemin.
   *
   * ⚠️ La destination est la page COURANTE, pas un accueil : on se connecte en
   * passant — depuis le rayon, depuis le panier — et renvoyer ailleurs ferait
   * perdre ce qu'on regardait. La phrase « Créer mon compte » garde, elle, son
   * lien vers `/inscription`.
   */
  protected signIn(): void {
    SignInDialog.open(this.panels, this.router.url);
  }

  /** Reconnu = la barre sert son menu de personne ; sinon, elle sert l'entrée. */
  protected readonly recognised = computed(() => this.auth.isAuthenticated());

  constructor() {
    // Instancié pour son EFFET, pas pour son API : c'est lui qui repose prénom
    // et téléphone au retour d'Auth0. Un service `providedIn: 'root'` que
    // personne n'injecte ne s'exécute jamais.
    inject(ClientOnboarding);
    // Même raison : c'est lui qui déclare l'établissement au retour de la porte
    // pro. Le shell enveloppe `/mon-compte`, où ce retour atterrit.
    inject(ProOnboarding);
  }

  protected goBack(): void {
    this.chrome.back()?.();
  }

  /**
   * Le menu de poche est ouvert ?
   *
   * L'état vit ICI et pas dans l'écran : le menu est du chrome, il survit à la
   * navigation, et un écran qui le porterait le refermerait en se démontant —
   * pile au moment où on vient de s'en servir pour partir ailleurs.
   */
  protected readonly menuOpen = signal(false);

  protected openMenu(): void {
    this.menuOpen.set(true);
  }
}
