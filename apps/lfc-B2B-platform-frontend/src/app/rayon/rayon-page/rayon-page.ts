import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro } from '../../client/cart-total';
import { ClientCart } from '../../client/client-cart.service';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientOrder } from '../../client/client-order.service';
import { ClientOrders } from '../../client/client-orders.service';
import { ClientCopyService, fill } from '../../client/copy/client-copy.service';
import { ALL_SHELVES, productById, SHOP_CATEGORIES, SHOP_PRODUCTS } from '../../client/mock-shop';
import { CartBar } from '../cart-bar/cart-bar';
import { CartSummary } from '../cart-summary/cart-summary';
import { ProductSheet } from '../product-sheet/product-sheet';
import { ProductTile } from '../product-tile/product-tile';
import { RayonSheet } from '../rayon-sheet/rayon-sheet';
import { ShelfBanner } from '../shelf-banner/shelf-banner';

/** Retire accents et casse : « éclair » et « eclair » cherchent la même chose. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Le rayon — une vitrine, pas une liste.
 *
 * Trois colonnes plutôt qu'une : quatorze références en liste verticale
 * faisaient quatorze écrans de pouce. En grille, six pièces sont visibles sans
 * défiler, et une boulangerie se regarde comme une vitrine.
 *
 * La recherche TRAVERSE les rayons : « pain » sort le pain de campagne, la
 * baguette et le pain au chocolat, parce que le client ne sait pas dans quel
 * rayon on a rangé quoi. Chercher remet donc le filtre à zéro — les deux
 * répondent à la même question, et une seule peut gagner.
 *
 * Le mode de service n'est jamais une étape passée : la barre le rappelle en
 * permanence, et sans lui l'écran renvoie à la question qu'on a sautée.
 */
@Component({
  selector: 'app-rayon-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartBar,
    CartSummary,
    FoldIconComponent,
    ProductSheet,
    ProductTile,
    RayonSheet,
    ShelfBanner,
  ],
  templateUrl: './rayon-page.html',
  styleUrl: './rayon-page.scss',
})
export class RayonPage {
  private readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly order = inject(ClientOrder);
  private readonly orders = inject(ClientOrders);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  protected readonly query = signal('');
  protected readonly shelf = signal(ALL_SHELVES);

  /** La pièce dont la fiche est ouverte. */
  protected readonly openPiece = signal<string | null>(null);

  /** Le rayon dont la feuille « En savoir plus » est ouverte. */
  protected readonly openStory = signal<string | null>(null);

  protected readonly choice = this.order.choice;

  protected readonly shelves = computed(() => [
    { id: ALL_SHELVES, label: this.t().shop.allShelves },
    ...SHOP_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ]);

  protected readonly products = computed(() => {
    const query = fold(this.query().trim());
    if (query !== '') {
      return SHOP_PRODUCTS.filter(
        (p) => fold(p.name).includes(query) || fold(p.note).includes(query),
      );
    }
    const shelf = this.shelf();
    return shelf === ALL_SHELVES
      ? SHOP_PRODUCTS
      : SHOP_PRODUCTS.filter((p) => p.category === shelf);
  });

  /** Le titre de la grille : le rayon, ou ce qu'on vient de chercher. */
  protected readonly heading = computed(() => {
    const c = this.t().shop;
    const query = this.query().trim();
    if (query !== '') {
      return fill(c.resultsFor, { query });
    }
    const shelf = this.shelf();
    return shelf === ALL_SHELVES
      ? c.allShelvesTitle
      : (SHOP_CATEGORIES.find((s) => s.id === shelf)?.shelf ?? c.allShelvesTitle);
  });

  protected readonly countLabel = computed(() =>
    fill(this.t().shop.pieces, { count: String(this.products().length) }),
  );

  protected readonly cartLabel = computed(() =>
    fill(this.t().shop.cartBar, { count: String(this.cart.count()) }),
  );

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatEuro(this.cart.totals().total) }),
  );

  /** La bannière porte l'histoire du rayon FILTRÉ — « Tout » a la sienne. */
  /** Le rappel du service, sur une ligne — vide tant qu'aucun n'est pris. */
  protected readonly whereLabel = computed(() => {
    const service = this.choice();
    return service === null ? '' : `${service.place} · ${service.slot}`;
  });

  /** La barre du bas ne porte que le montant : le verbe est dans son titre. */
  protected readonly totalLabel = computed(() => formatEuro(this.cart.totals().total));

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
    effect(() => {
      // Le catalogue dépend du mode : ce qui est en stock, à quelle heure et à
      // quel prix. Sans mode, il n'y a pas de rayon à montrer — on renvoie à la
      // question plutôt que d'inventer une réponse.
      if (this.order.choice() === null) {
        void this.router.navigate(['/commande']);
      }
    });
  }

  protected pickShelf(id: string): void {
    this.shelf.set(id);
    this.query.set('');
  }

  /**
   * Le champ est natif : la recherche du rayon a besoin d'une loupe, d'une croix
   * conditionnelle et d'une remise à zéro COMMANDÉE de l'extérieur (choisir un
   * rayon efface la recherche), ce que `fold-search` ne laisse pas faire.
   */
  protected search(event: Event): void {
    const field = event.target;
    if (field instanceof HTMLInputElement) {
      this.query.set(field.value);
    }
  }

  protected backToService(): void {
    void this.router.navigate(['/commande']);
  }

  protected goToCart(): void {
    void this.router.navigate(['/commande/panier']);
  }

  /**
   * Au-delà du pli, le panier est SOUS les yeux en permanence : régler depuis la
   * colonne de droite n'est pas sauter une étape, c'est ne pas en inventer une.
   */
  protected pay(): void {
    if (this.orders.place() !== null) {
      void this.router.navigate(['/commande/confirmee']);
    }
  }
}
