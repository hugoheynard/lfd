import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldSearchComponent,
} from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { CartEntries } from '../../cart/cart-entries';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientChrome } from '../../../client/client-chrome.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { ShopCatalogue } from '../shop-catalogue.store';
import { Shop } from '../shop.service';
import { ShopStorefront } from '../storefront/shop-storefront.store';
import { ShopStore } from '../shop.store';
import { ShelfAddress } from '../shelf-address';
import { CartFulfillmentDays } from '../cart-fulfillment-days.service';
import { OrderBar } from '../order-bar/order-bar';
import { OrderDoors } from '../order-doors';
import { CartBar } from '../../cart/cart-bar/cart-bar';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ProductAudience } from '../../audience/product-audience.service';
import { ProductSheet } from '../product-sheet/product-sheet';
import { ProVisitNote } from '../pro-visit-note/pro-visit-note';
import { ProVisit } from '../pro-visit.service';
import { PieceRequest } from '../piece-request.service';
import { OperationNotice } from '../operation-notice/operation-notice';
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
    CartBar,
    OrderBar,
    ClientBannerOutlet,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldSearchComponent,
    OperationNotice,
    ProductSheet,
    ProVisitNote,
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
  providers: [ShopStore, Shop, ShelfAddress],
})
export class ShopPage {
  protected readonly chrome = inject(ClientChrome);
  private readonly order = inject(OrderContextStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly doors = inject(OrderDoors);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);

  protected readonly shop = inject(Shop);
  private readonly catalogue = inject(ShopCatalogue);

  /** L'état du chargement, tel que l'écran le rend. */
  protected readonly status = this.catalogue.status;

  private readonly storefront = inject(ShopStorefront);
  private readonly audience = inject(ProductAudience);
  private readonly entries = inject(CartEntries);

  /**
   * L'état de la page de vitrine du rayon affiché — `null` pendant une
   * recherche : elle traverse les rayons, et aucune mise en scène ne répond à
   * la question posée. « Tout » a la sienne (clé `all`).
   */
  private readonly pageState = computed(() => {
    const shelf = this.shop.activeShelf();
    return shelf === null ? null : this.storefront.stateOf(shelf);
  });

  /**
   * La page à composer, ou `null` : la grille rend alors le rayon comme avant
   * la vitrine — pendant le chargement de la page comme après son échec.
   * 🔴 Une vitrine injoignable n'est pas un écran vide, et une vitrine lente ne
   * retient pas le rayon : il est là, et se compose quand la page arrive. Au
   * rendu serveur, la page est attendue avec le reste, et le visiteur reçoit
   * la grille déjà composée.
   */
  protected readonly page = computed(() => {
    const state = this.pageState();
    return state?.status === 'ready' ? state.page : null;
  });

  /** La pièce dont la fiche est ouverte. */
  protected readonly openPiece = signal<string | null>(null);

  /** Le tiroir du panier. Fermé en arrivant : on vient voir le rayon. */

  protected readonly choice = this.order.choice;

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) }),
  );

  /**
   * On peut VISITER le rayon sans avoir dit où l'on est servi — c'est ce que
   * « je visite la boutique » promet. Le mode reste exigé pour régler : le
   * décompte le réclame (remise, frais), et le bouton mène alors à la question
   * au lieu de la sauter.
   */
  /** La visite pro est-elle à l'écran ? Elle ouvre une rangée de plus. */
  protected readonly proVisit = inject(ProVisit).active;

  protected readonly needsService = computed(() => this.choice() === null);

  protected readonly piece = computed(() => {
    const id = this.openPiece();
    return id === null ? null : this.catalogue.itemOf(id);
  });

  protected readonly pieceQuantity = computed(() => {
    const id = this.openPiece();
    return id === null ? 0 : this.cart.quantityOf(id);
  });

  /**
   * La fiche a validé son brouillon : la quantité est POSÉE, pas ajoutée, et la
   * fiche se ferme — on revient au rayon avec le lot au panier.
   */
  protected setPieceQuantity(quantity: number): void {
    const id = this.openPiece();
    if (id === null) {
      return;
    }
    const entering = this.cart.quantityOf(id) === 0 && quantity > 0;
    // La visite pro détourne le geste vers la connexion : la fiche reste ouverte.
    if (this.cart.setQuantity(id, quantity) === 'signInRequired') {
      return;
    }
    if (entering) {
      this.audience.record(id, 'added_to_cart');
    }
    if (entering && this.cart.quantityOf(id) > 0) {
      this.entries.entered(id);
    }
    this.openPiece.set(null);
  }

  constructor() {
    // Une fiche demandée d'ailleurs — une suggestion du staff à l'accueil, au
    // panier, dans « Ajouté ! » ou sur une autre fiche (Hugo, 2026-10-18) —
    // s'ouvre ici, une fois, comme si sa tuile avait été touchée.
    const pieces = inject(PieceRequest);
    effect(() => {
      pieces.latest();
      const sku = untracked(() => pieces.take());
      if (sku !== null) {
        this.openPiece.set(sku);
      }
    });
    // La vue d'une fiche est comptée, anonymement, à son ouverture (R5 bis).
    effect(() => {
      const id = this.openPiece();
      if (id !== null) {
        untracked(() => {
          this.audience.record(id, 'product_viewed');
        });
      }
    });
    // Les jours proposés suivent les articles d'opération du panier (D6) :
    // les deux écrans qui ouvrent le choix de l'heure le démarrent.
    inject(CartFulfillmentDays);
    // Le rayon suit l'adresse (`?rayon=`), et l'adresse suit le rayon.
    inject(ShelfAddress);
    this.chrome.kicker.set(this.t().chrome.kickerShop);
    this.chrome.barOnDesktop.set(true);
    // Pas de chevron : le logo reprend le coin (Hugo, 2026-09-24 — « ça
    // ressemble à de l'ancien flow »).
    this.chrome.back.set(null);
    // La poignée de la languette, en pile (plan lot 3) : le chrome la dessine,
    // l'écran la demande — et la rend en partant.
    this.chrome.bandHandle.set(true);
    inject(DestroyRef).onDestroy(() => this.chrome.bandHandle.set(false));
    // En visite pro, le panier quitte la barre (Hugo, 2026-10-19 : « un pro non
    // loggé ne doit pas pouvoir commander ») ; il revient quand elle cesse, ou
    // en quittant la page.
    effect(() => this.chrome.cart.set(!this.proVisit()));
    inject(DestroyRef).onDestroy(() => this.chrome.cart.set(true));
    // L'HYDRATATION, au seul endroit qui l'ouvre. Idempotente : revenir au rayon
    // depuis le panier ne redemande rien.
    void this.catalogue.hydrate();
    // La page de vitrine du rayon affiché, une fois par rayon et par lecteur :
    // se reconnaître ou changer d'espace relit (une annonce vise une clientèle).
    effect(() => {
      const shelf = this.shop.activeShelf();
      this.storefront.reader();
      if (shelf !== null) {
        untracked(() => {
          void this.storefront.load(shelf);
        });
      }
    });
  }

  /** Réessayer après un échec — le seul geste qu'un écran vide doit offrir. */
  protected retry(): void {
    void this.catalogue.hydrate();
  }

  /**
   * Changer de maison ouvre les DIALOGUES, sans quitter le rayon : le panier
   * est composé, et partir le ferait perdre de vue. La séquence (maison, puis
   * heure redemandée) est celle d'{@link OrderDoors}, comme au panier et à
   * l'accueil.
   */
  protected async changeHouse(): Promise<void> {
    await this.openService(false);
  }

  /** Changer l'heure sans redemander la maison — ou poser le service s'il manque. */
  protected async changeTime(): Promise<void> {
    await this.openService(true);
  }

  /**
   * Rouvre la porte du service tel qu'il est.
   *
   * 🔴 Régression (Hugo, 2026-10-11 : « quand je fais Régler dans la barre ça
   * me ramène sur bienvenue ») : sans service choisi, cet écran renvoyait à
   * l'accueil au lieu d'ouvrir les dialogues que le panier et l'accueil
   * ouvrent déjà sur place.
   *
   * @returns `true` quand un service est posé en sortant.
   */
  private async openService(timeOnly: boolean): Promise<boolean> {
    const service = this.choice();
    if (service === null) {
      return this.doors.choose();
    }
    if (service.mode === 'delivery') {
      return this.doors.delivery(service.deliveryAddressId ?? null, service.date);
    }
    if (timeOnly && service.pickupAddressId !== null) {
      return this.doors.time(service.pickupAddressId, service.place, service.address);
    }
    return this.doors.pickup(service.pickupAddressId);
  }

  /**
   * Ouvre le panier entier — chargé à la demande, comme la pastille de la barre
   * le fait : c'est le même panneau, et le sortir du chunk du rayon évite de le
   * charger à qui ne règle pas.
   */
  private async openCart(): Promise<void> {
    const { CartDialog } = await import('../../cart/cart-dialog/cart-dialog');
    await CartDialog.open(this.panels).closed;
  }

  /**
   * **« Régler » ouvre TOUJOURS le récapitulatif du panier.**
   *
   * 🔴 Régression (Hugo, 2026-10-13 : « quand je fais Régler ça m'amène
   * directement à la confirmation de commande sans passer par la page récap
   * de panier avec le choix au compte / carte en pro ») : connecté, ce geste
   * passait la commande sur place, sans montrer ni la date du service (et son
   * avertissement « trop tard pour demain »), ni le choix du règlement. La
   * commande ne se passe plus que depuis `CartDialog`, qui porte les deux —
   * et qui pose aussi, au visiteur, les deux portes de l'identité.
   */
  protected async pay(): Promise<void> {
    // Sans service, on le pose ICI, en dialogues, puis on enchaîne : fermer
    // sans choisir laisse le panier tel quel.
    // Rien à choisir (2026-10-16) : le panier dit pourquoi, plutôt qu'un clic
    // qui n'ouvre rien.
    if (this.needsService() && this.doors.serviceOffered() && !(await this.doors.choose())) {
      return;
    }
    await this.openCart();
  }
}
