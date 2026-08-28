import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import {
  FoldAppShellComponent,
  FoldButtonIconComponent,
  FoldIconComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldNavLauncherComponent,
  FoldNavTileComponent,
  FoldPanelHostComponent,
  FoldPanelHostService,
  FoldSpinnerComponent,
  FoldSurfaceDirective,
  FoldToastContainerComponent,
} from 'fold-ng';

import { AccountService } from './account/account.service';
import { ClientShell } from './client/shell/client-shell';
import { AuthFacade } from './auth/auth.facade';
import { CartPanel } from './legacy/cart/cart-panel/cart-panel';
import { ContactPanel } from './legacy/contact/contact-panel/contact-panel';
import { CartService } from './legacy/data/cart.service';
import { FEATURE_DASHBOARD } from './feature-flags';
import { SiteFooter } from './legacy/footer/site-footer';

/**
 * L'écran courant est-il servi par le shell CLIENT ?
 *
 * On le DEMANDE au routeur au lieu de tenir une liste d'adresses. La liste avait
 * l'air plus simple, et elle a dérivé au premier écran ajouté : `/commande` et
 * la boutique cliente n'y étaient pas, donc le chrome PRO — rail, en-tête,
 * lanceur mobile — venait s'enrouler autour d'eux dès qu'on était connecté.
 * Un fait déduit de l'arbre de routes ne peut pas se désaccorder de l'arbre de
 * routes.
 */
export function servedByClientShell(route: ActivatedRouteSnapshot): boolean {
  return route.component === ClientShell || route.children.some(servedByClientShell);
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FoldAppShellComponent,
    FoldButtonIconComponent,
    FoldIconComponent,
    FoldMenuComponent,
    FoldMenuItemComponent,
    FoldNavLauncherComponent,
    FoldNavTileComponent,
    FoldPanelHostComponent,
    FoldSpinnerComponent,
    FoldSurfaceDirective,
    FoldToastContainerComponent,
    SiteFooter,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  /**
   * Le rail primaire est **toujours étendu et non-collapsible** : pas de
   * `collapsible` sur `fold-menu` (donc pas de chevron), et `[expanded]="true"`
   * figé — sans cette valeur autoritaire un menu non-collapsible booterait en
   * rail d'icônes (défaut fold : `expanded` non lié suit `collapsible`). Le
   * wordmark est donc rendu en permanence.
   */
  protected readonly menuExpanded = true;

  /** Le tableau de bord est masqué tant que le feature flag est off (cf. routes). */
  protected readonly showDashboard = FEATURE_DASHBOARD;

  /** Tiroir mobile — le rail primaire devient off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Les écrans de l'app CLIENT portent leur PROPRE shell (barre de marque bleue,
   * pas de rail) : le chrome pro ne doit pas les envelopper.
   *
   * Le choix se fait sur la ROUTE, pas sur l'authentification. Le déduire de la
   * session était faux dans les deux sens : une personne connectée qui ouvre un
   * écran client héritait du rail pro, et le jour où un écran client demandera
   * une session, il le perdrait.
   *
   * `url()` n'est pas lu pour sa valeur mais pour sa DÉPENDANCE : c'est lui qui
   * fait recalculer à chaque navigation, et l'état du routeur qui répond.
   */
  protected readonly clientRoute = computed(() => {
    this.url();
    return servedByClientShell(this.router.routerState.snapshot.root);
  });

  private readonly panelHost = inject(FoldPanelHostService);
  protected readonly cart = inject(CartService);
  protected readonly auth = inject(AuthFacade);
  /**
   * Injecté ici même si le template ne lit que `displayEmail` : c'est ce qui
   * instancie le service au démarrage de l'app, et donc ce qui déclenche le
   * chargement de `GET /me` dès qu'Auth0 confirme l'authentification.
   */
  protected readonly account = inject(AccountService);

  /** Vrai tant qu'un panneau panier est ouvert (évite la ré-ouverture). */
  private cartOpen = false;

  /** Ouvre le panneau panier (le host est mono-panneau : il remplace l'existant).
   * Déclenché **uniquement** par le clic sur l'icône panier — ajouter un produit ne
   * l'ouvre plus (le badge du déclencheur suffit comme retour). */
  /** Ouvre le panneau **contact** (contact direct / prise de RDV). */
  protected openContact(): void {
    this.panelHost.open(ContactPanel);
  }

  protected openCart(): void {
    if (this.cartOpen) {
      return;
    }
    this.cartOpen = true;
    // Panier = non-modal + surface solid, déclaré sur CartPanel.foldPanel.
    const ref = this.panelHost.open(CartPanel);
    void ref.closed.then(() => {
      this.cartOpen = false;
    });
  }

  /**
   * Déconnexion Auth0 : purge la session côté SDK et redirige vers l'origine
   * (le guard renverra ensuite vers `/login`). Ferme d'abord le tiroir mobile.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    this.auth.logout();
  }
}
