import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NavCountsService } from './nav-counts.service';
import {
  FoldAppShellComponent,
  FoldButtonIconComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldNavLauncherComponent,
  FoldNavTileComponent,
  FoldPanelHostComponent,
  FoldSpinnerComponent,
  FoldSurfaceDirective,
  FoldToastContainerComponent,
} from 'fold-ng';

import { PermissionsStore } from './auth/permissions.store';
import { StaffAuth } from './auth/staff-auth';
import { StaffLoginPage } from './auth/staff-login/staff-login';
import { CanDirective } from './shared/can/can.directive';
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
    FoldButtonIconComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldNavLauncherComponent,
    FoldNavTileComponent,
    FoldPanelHostComponent,
    FoldSpinnerComponent,
    FoldSurfaceDirective,
    FoldToastContainerComponent,
    NotificationBell,
    StaffLoginPage,
    CanDirective,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /** Rail primaire : déployé par défaut, repliable via le chevron intégré. */
  protected readonly menuExpanded = signal<boolean | undefined>(true);
  /**
   * Navigation mobile ≤768px. Le shell ne rend aucun tiroir
   * (`mobileNav="none"`) : ce drapeau ouvre la grille de tuiles, et le burger
   * de l'en-tête le bascule.
   */
  protected readonly mobileNavOpen = signal(false);

  private readonly auth = inject(StaffAuth);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Le menu se déduit des **permissions**, jamais du rôle : le jour où une
   * dérogation ouvre la croissance à quelqu'un, l'entrée apparaît sans qu'on y
   * touche.
   */
  protected readonly canSeeCompanies = computed(() => this.permissions.can('companies:read'));

  private readonly counts = inject(NavCountsService);
  /** Ce qui attend derrière chaque entrée — `undefined` masque le badge. */
  protected readonly companyBadge = computed(() =>
    this.counts.companyWarnings() > 0 ? this.counts.companyWarnings() : undefined,
  );
  protected readonly accessBadge = computed(() =>
    this.counts.accessPending() > 0 ? this.counts.accessPending() : undefined,
  );
  protected readonly canSeeCommercial = computed(() => this.permissions.can('growth:read'));
  /** Le fournil lit les commandes ; il n'a rien à voir avec le commercial. */
  /**
   * Analytics lit le même droit que Commercial (`growth:read`) — c'est la même
   * matière, lue pour comprendre plutôt que pour agir. Un droit à part
   * n'aurait de sens que le jour où l'on montrera des chiffres qu'un
   * commercial ne doit pas voir.
   */
  protected readonly canSeeAnalytics = computed(() => this.permissions.can('growth:read'));

  protected readonly canSeeProduction = computed(() => this.permissions.can('orders:read'));

  /** Le PIM — même droit que le catalogue, puisque c'est le catalogue. */
  protected readonly canSeePim = computed(() => this.permissions.can('catalog:read'));

  /**
   * **Admin** — deux vues, deux murs : les accès à remettre demandent
   * `companies:read`, l'annuaire de l'équipe `staff:read`. L'entrée s'ouvre sur
   * le PLUS FAIBLE des deux, et la coquille filtre ses onglets ensuite : la
   * fermer sur `staff:read` retirerait au commercial un canal de secours qu'il
   * utilise, la fermer sur les deux à la fois enfermerait dehors qui n'a que
   * l'un. Le mur reste, comme toujours, côté backend.
   */
  protected readonly canSeeAdmin = computed(
    () => this.permissions.can('companies:read') || this.permissions.can('staff:read'),
  );
  protected readonly canSeeSettings = computed(() => this.permissions.can('settings:read'));
  /**
   * La carte de santé. Son propre périmètre (`ops:read`), et pas celui des
   * réglages : regarder la flotte n'est pas la régler, et le jour où l'un
   * s'ouvre à quelqu'un l'autre n'a aucune raison de suivre.
   */
  protected readonly canSeeOps = computed(() => this.permissions.can('ops:read'));

  /**
   * Connecté, mais l'annuaire ne nous connaît pas — ou plus. On le **dit** :
   * une coquille vide et un menu sans entrées ressembleraient à une panne, et
   * la personne appellerait au lieu de demander un accès.
   */
  protected readonly noAccess = computed(
    () => this.permissions.loaded() && this.permissions.permissions().length === 0,
  );

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

  constructor() {
    // La lecture ne peut pas partir avant la session : sans jeton, `/admin/me`
    // rendrait 401 et on conclurait « aucun accès » à tort.
    effect(() => {
      if (!this.resolving() && !this.locked()) {
        void this.permissions.ensureLoaded();
      }
    });

    // Les compteurs du menu partent avec les permissions, et pas avant : sans
    // droits résolus, les deux lectures reviendraient en 403 et laisseraient
    // des badges à zéro qui ressembleraient à « rien à faire ».
    effect(() => {
      if (this.canSeeCompanies()) {
        void this.counts.refresh();
      }
    });
  }

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
