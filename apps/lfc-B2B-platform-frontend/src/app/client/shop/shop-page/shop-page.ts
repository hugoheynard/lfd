import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldSearchComponent,
} from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientChrome } from '../../../client/client-chrome.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientOrders } from '../../../client/client-orders.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { ShopCatalogue } from '../shop-catalogue.store';
import { Shop } from '../shop.service';
import { ShopStore } from '../shop.store';
import { CartBannerCard } from '../../cart/cart-banner-card/cart-banner-card';
import { CartBar } from '../../cart/cart-bar/cart-bar';
import { CartPanel } from '../../cart/cart-panel/cart-panel';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ProductSheet } from '../product-sheet/product-sheet';
import { ShelfSheet } from '../shelf-sheet/shelf-sheet';
import { ShelfBanner } from '../shelf-banner/shelf-banner';
import { ShelfGrid } from './shelf-grid/shelf-grid';
import { ShelfNav } from './shelf-nav/shelf-nav';

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
 * Le mode de service n'est jamais une étape passée : la carte du bandeau le
 * rappelle en permanence, et sans lui l'écran renvoie à la question qu'on a
 * sautée.
 *
 * 🔴 **Le panier est un TIROIR**, plus une colonne. Ce qu'on regarde en
 * parcourant un rayon tient en trois nombres — pièces, montant, lieu — et ils
 * sont dans le bandeau ; le détail s'ouvre à la demande. La vitrine récupère
 * les 360 px, et l'écran retrouve la forme des autres : un bandeau, une page.
 */
@Component({
  selector: 'app-shop-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartBannerCard,
    CartBar,
    CartPanel,
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
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
  protected readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly order = inject(OrderContextStore);
  private readonly orders = inject(ClientOrders);
  private readonly auth = inject(AuthFacade);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  protected readonly shop = inject(Shop);
  private readonly catalogue = inject(ShopCatalogue);

  /** La pièce dont la fiche est ouverte. */
  protected readonly openPiece = signal<string | null>(null);

  /** Le rayon dont la feuille « En savoir plus » est ouverte. */
  protected readonly openStory = signal<string | null>(null);

  /** Le tiroir du panier. Fermé en arrivant : on vient voir le rayon. */
  protected readonly cartOpen = signal(false);

  protected readonly choice = this.order.choice;

  protected readonly cartLabel = computed(() =>
    fill(this.t().shop.cartBar, { count: String(this.cart.count()) }),
  );

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) }),
  );

  /** Le rappel du service, sur une ligne — vide tant qu'aucun n'est pris. */
  protected readonly whereLabel = computed(() => {
    const service = this.choice();
    return service === null ? '' : `${service.place} · ${service.slot}`;
  });

  /** La barre du bas ne porte que le montant : le verbe est dans son titre. */
  protected readonly totalLabel = computed(() => formatCents(this.cart.totals().totalCents));

  /**
   * On peut VISITER le rayon sans avoir dit où l'on est servi — c'est ce que
   * « je visite la boutique » promet. Le mode reste exigé pour régler : le
   * décompte le réclame (remise, frais), et le bouton mène alors à la question
   * au lieu de la sauter.
   */
  protected readonly needsService = computed(() => this.choice() === null);

  protected readonly piece = computed(() => {
    const id = this.openPiece();
    return id === null ? null : this.catalogue.itemOf(id);
  });

  protected readonly pieceQuantity = computed(() => {
    const id = this.openPiece();
    return id === null ? 0 : this.cart.quantityOf(id);
  });

  /** L'état du chargement, tel que l'écran le rend. */
  protected readonly status = this.catalogue.status;

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerShop);
    this.chrome.barOnDesktop.set(true);
    this.chrome.back.set((): void => this.backToService());
    // L'HYDRATATION, au seul endroit qui l'ouvre. Idempotente : revenir au rayon
    // depuis le panier ne redemande rien.
    void this.catalogue.hydrate();
  }

  /** Réessayer après un échec — le seul geste qu'un écran vide doit offrir. */
  protected retry(): void {
    void this.catalogue.hydrate();
  }

  protected backToService(): void {
    void this.router.navigate(['/nouvelle-commande']);
  }

  /**
   * Le panier est SOUS les yeux en permanence — trois nombres dans le bandeau,
   * le détail à un geste : régler d'ici n'est pas sauter une étape, c'est ne
   * pas en inventer une.
   */
  protected async pay(): Promise<void> {
    if (this.needsService()) {
      this.backToService();
      return;
    }
    // 🔴 Se connecter n'est PAS un échec, c'est l'étape suivante. La boutique se
    // visite sans compte ; commander non, parce qu'une commande a un
    // propriétaire. Le panier survit à l'aller-retour — il vit en base pour qui
    // a déjà un compte, dans le navigateur pour les autres.
    if (!this.auth.isAuthenticated()) {
      this.auth.login('/nouvelle-commande/boutique');
      return;
    }
    if ((await this.orders.place()) !== null) {
      void this.router.navigate(['/nouvelle-commande/confirmee']);
    }
  }
}
