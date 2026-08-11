import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldSpinnerComponent,
  FoldToastContainerComponent,
} from 'fold-ng';

import { StaffAuth } from './auth/staff-auth';
import { StaffLoginPage } from './auth/staff-login/staff-login';
import { NotificationBell } from './shared/notifications/notification-bell/notification-bell';
import { SuiteEmbed } from './suite-embed/suite-embed';

/**
 * Racine de l'app **B2B admin** (staff). Structurée comme PIM : un rail de
 * navigation + le contenu routé. Embarquée dans la suite, le rail passe de
 * `primary` à `secondary` (le rail navy primaire est le switcher de la suite) ;
 * en standalone, `primary`.
 *
 * C'est aussi ici que se joue la **porte d'entrée** hors du shell : tant que la
 * session n'est pas résolue — ou qu'elle est vide — la coquille n'est pas rendue
 * du tout. Un rail de menu derrière un écran de connexion n'offrirait que des
 * liens qui échoueraient tous, et le premier clic partirait sans jeton.
 *
 * La porte est ici plutôt que dans un garde de route parce qu'elle ne dépend
 * d'AUCUNE route : elle vaut pour les vingt écrans, et l'adresse demandée est
 * restaurée après le retour d'Auth0 (cf. `StaffAuth`) — donc rien à recopier
 * dans un `returnTo` sur chaque route.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FoldAppShellComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldPanelHostComponent,
    FoldSpinnerComponent,
    FoldToastContainerComponent,
    NotificationBell,
    StaffLoginPage,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Rail primaire : déployé par défaut, repliable via le chevron intégré. */
  protected readonly menuExpanded = signal<boolean | undefined>(true);
  /** Tiroir off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  private readonly auth = inject(StaffAuth);

  /** Embarqué dans la suite (iframe) ? → rail `secondary` ; sinon `primary`. */
  protected readonly hosted = inject(SuiteEmbed).hosted;

  /** Session en cours de résolution : on ne montre ni la porte ni l'app. */
  protected readonly resolving = this.auth.isLoading;

  /** E-mail du staff connecté, quand la session est celle de cette app. */
  protected readonly email = this.auth.email;

  /**
   * Montrer la porte ? Seulement quand cette app porte sa propre session et que
   * personne n'y est entré. Embarquée — ou sur un poste sans Auth0 configuré —
   * `ownsSession` est faux : l'app s'affiche, et c'est le **backend** qui refuse
   * ou non les appels. Le front n'a jamais été le mur.
   */
  protected readonly locked = computed(
    () => this.auth.ownsSession && !this.auth.isAuthenticated() && !this.auth.isLoading(),
  );

  private readonly router = inject(Router);

  /**
   * Déconnexion. Standalone, elle ferme la vraie session Auth0 (retour sur la
   * porte). Embarquée, la session appartient au shell : on ne peut que refermer
   * le tiroir et revenir à l'accueil — se déconnecter de la suite depuis une
   * app hébergée déconnecterait aussi les autres.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    if (this.auth.ownsSession) {
      this.auth.logout();
      return;
    }
    void this.router.navigateByUrl('/');
  }
}
