import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  FoldAppShellComponent,
  FoldButtonIconComponent,
  FoldIconComponent,
  FoldMenuComponent,
  FoldMenuItemComponent,
  FoldPanelHostComponent,
  FoldPanelHostService,
  FoldSearchComponent,
  FoldSurfaceDirective,
} from 'fold-ng';

import { CartPanel } from './cart/cart-panel/cart-panel';
import { CartService } from './data/cart.service';

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
    FoldPanelHostComponent,
    FoldSearchComponent,
    FoldSurfaceDirective,
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

  /** Tiroir mobile — le rail primaire devient off-canvas ≤768px. */
  protected readonly mobileNavOpen = signal(false);

  private readonly router = inject(Router);
  private readonly panelHost = inject(FoldPanelHostService);
  protected readonly cart = inject(CartService);

  /** Vrai tant qu'un panneau panier est ouvert (évite la ré-ouverture). */
  private cartOpen = false;
  /** Nombre d'articles au tick précédent (détecte le passage vide → non-vide). */
  private prevCartCount = 0;

  constructor() {
    // Ouverture automatique au **premier** produit ajouté (vide → non-vide).
    effect(() => {
      const count = this.cart.count();
      if (this.prevCartCount === 0 && count > 0) {
        untracked(() => this.openCart());
      }
      this.prevCartCount = count;
    });
  }

  /** Ouvre le panneau panier (le host est mono-panneau : il remplace l'existant). */
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
   * Déconnexion. L'auth n'est pas encore câblée côté front : on ferme le tiroir
   * et on revient au tableau de bord. Le vrai flux (purge du jeton + redirection
   * login) se branchera ici quand le backend B2B existera.
   */
  protected logout(): void {
    this.mobileNavOpen.set(false);
    void this.router.navigateByUrl('/');
  }
}
