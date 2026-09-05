import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FoldElementTitleComponent, FoldSearchComponent } from 'fold-ng';

import { formatEuro } from '../../../client/format-money';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientChrome } from '../../../client/client-chrome.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { ClientOrders } from '../../../client/client-orders.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { productById } from '../mock-shop';
import { Shop } from '../shop.service';
import { ShopStore } from '../shop.store';
import { CartBar } from '../../cart/cart-bar/cart-bar';
import { CartSummary } from '../../cart/cart-summary/cart-summary';
import { ProductSheet } from '../product-sheet/product-sheet';
import { ShelfSheet } from '../shelf-sheet/shelf-sheet';
import { ShelfBanner } from '../shelf-banner/shelf-banner';
import { ShelfGrid } from './shelf-grid/shelf-grid';
import { ShelfNav } from './shelf-nav/shelf-nav';
import { OrderContextBar } from './order-context-bar/order-context-bar';

/**
 * La boutique — une vitrine, pas une liste.
 *
 * Trois colonnes plutôt qu'une : quatorze références en liste verticale
 * faisaient quatorze écrans de pouce. En grille, six pièces sont visibles sans
 * défiler, et une boulangerie se regarde comme une vitrine.
 *
 * Ce qu'elle montre — le filtrage, le titre, l'arbitrage entre chercher et
 * choisir un rayon — appartient à {@link Shop}. Ce qui reste ici est ce qu'un
 * ÉCRAN sait : quelle feuille est ouverte, où mènent ses boutons, et le chrome
 * qu'il pose en arrivant.
 *
 * Le mode de service n'est jamais une étape passée : `OrderContextBar` le
 * rappelle en permanence, et sans lui l'écran renvoie à la question qu'on a
 * sautée.
 */
@Component({
  selector: 'app-shop-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartBar,
    CartSummary,
    FoldElementTitleComponent,
    FoldSearchComponent,
    OrderContextBar,
    ProductSheet,
    ShelfSheet,
    ShelfBanner,
    ShelfGrid,
    ShelfNav,
  ],
  templateUrl: './shop-page.html',
  styleUrl: './shop-page.scss',
  /**
   * L'état de la boutique naît et meurt avec l'écran : revenir la rouvre sur
   * « Tout ». Le fournir à la racine la rouvrirait sur le dernier rayon
   * parcouru — défendable, mais c'est un choix de produit, pas une conséquence
   * de la découpe. Cf. {@link ShopStore}.
   */
  providers: [ShopStore, Shop],
})
export class ShopPage {
  private readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly order = inject(OrderContextStore);
  private readonly orders = inject(ClientOrders);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  protected readonly shop = inject(Shop);

  /** La pièce dont la fiche est ouverte. */
  protected readonly openPiece = signal<string | null>(null);

  /** Le rayon dont la feuille « En savoir plus » est ouverte. */
  protected readonly openStory = signal<string | null>(null);

  protected readonly choice = this.order.choice;

  protected readonly cartLabel = computed(() =>
    fill(this.t().shop.cartBar, { count: String(this.cart.count()) }),
  );

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatEuro(this.cart.totals().total) }),
  );

  /** Le rappel du service, sur une ligne — vide tant qu'aucun n'est pris. */
  protected readonly whereLabel = computed(() => {
    const service = this.choice();
    return service === null ? '' : `${service.place} · ${service.slot}`;
  });

  /** La barre du bas ne porte que le montant : le verbe est dans son titre. */
  protected readonly totalLabel = computed(() => formatEuro(this.cart.totals().total));

  /**
   * On peut VISITER le rayon sans avoir dit où l'on est servi — c'est ce que
   * « je visite la boutique » promet. Le mode reste exigé pour régler : le
   * décompte le réclame (remise, frais), et le bouton mène alors à la question
   * au lieu de la sauter.
   */
  protected readonly needsService = computed(() => this.choice() === null);

  protected readonly piece = computed(() => {
    const id = this.openPiece();
    return id === null ? null : productById(id);
  });

  protected readonly pieceQuantity = computed(() => {
    const id = this.openPiece();
    return id === null ? 0 : this.cart.quantityOf(id);
  });

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerShop);
    this.chrome.barOnDesktop.set(true);
    this.chrome.back.set((): void => this.backToService());
  }

  protected backToService(): void {
    void this.router.navigate(['/nouvelle-commande']);
  }

  protected goToCart(): void {
    void this.router.navigate(['/nouvelle-commande/panier']);
  }

  /**
   * Au-delà du pli, le panier est SOUS les yeux en permanence : régler depuis la
   * colonne de droite n'est pas sauter une étape, c'est ne pas en inventer une.
   */
  protected pay(): void {
    if (this.needsService()) {
      this.backToService();
      return;
    }
    if (this.orders.place() !== null) {
      void this.router.navigate(['/nouvelle-commande/confirmee']);
    }
  }
}
