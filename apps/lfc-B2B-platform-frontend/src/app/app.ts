import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
import { AuthFacade } from './auth/auth.facade';
import { CartPanel } from './cart/cart-panel/cart-panel';
import { ContactPanel } from './contact/contact-panel/contact-panel';
import { CartService } from './data/cart.service';
import { FEATURE_DASHBOARD } from './feature-flags';
import { SiteFooter } from './footer/site-footer';

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
