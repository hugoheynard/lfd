import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { instantToLocal, type PickupAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldSearchComponent,
} from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { ClientCart } from '../../cart/client-cart.service';
import { ClientChrome } from '../../../client/client-chrome.service';
import { OrderContextStore } from '../../../client/order-context.store';
import { AuthFacade } from '../../../auth/auth.facade';
import { ClientOrders } from '../../../client/client-orders.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { ClientFeatureAccess } from '../../feature-access/client-feature-access.service';
import { ShopCatalogue } from '../shop-catalogue.store';
import { Shop } from '../shop.service';
import { MOCK_SHELF_FEATURES } from '../mock-shelf-feature';
import { ALL_SHELVES } from '../shelves';
import { ShopStore } from '../shop.store';
import { formatHour } from '../../format-hour';
import { ServicePoints } from '../pickup-points.store';
import { SlotPickerDialog } from '../slot-picker-dialog/slot-picker-dialog';
import { OrderBar } from '../order-bar/order-bar';
import { PublicHousePickerDialog } from '../public-house-picker-dialog/public-house-picker-dialog';
import { CartBar } from '../../cart/cart-bar/cart-bar';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ProductSheet } from '../product-sheet/product-sheet';
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
    ProductSheet,
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
  private readonly panels = inject(FoldPanelHostService);
  private readonly points = inject(ServicePoints);
  private readonly orders = inject(ClientOrders);
  private readonly auth = inject(AuthFacade);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  /** Au niveau `browse` exactement, la fiche porte une mention au lieu du geste d'ajout (plan §4). */
  protected readonly access = inject(ClientFeatureAccess);

  protected readonly shop = inject(Shop);
  private readonly catalogue = inject(ShopCatalogue);

  /**
   * Les mises en avant (tuile, bande) — sur « Tout » seulement. Dans un rayon, elle
   * s'interposerait entre le client et ce qu'il vient de choisir ; pendant une
   * recherche (`activeShelf` nul), elle ne répondrait pas à la question posée.
   */
  protected readonly features = computed(() =>
    this.shop.activeShelf() === ALL_SHELVES ? MOCK_SHELF_FEATURES : [],
  );

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
    this.cart.setQuantity(id, quantity);
    this.openPiece.set(null);
  }

  /** L'état du chargement, tel que l'écran le rend. */
  protected readonly status = this.catalogue.status;

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerShop);
    this.chrome.barOnDesktop.set(true);
    // Pas de chevron : le logo reprend le coin (Hugo, 2026-09-24 — « ça
    // ressemble à de l'ancien flow »). `backToService()` sert encore à
    // `pay()` et à `changeTime()` sans maison.
    this.chrome.back.set(null);
    // La poignée de la languette, en pile (plan lot 3) : le chrome la dessine,
    // l'écran la demande — et la rend en partant.
    this.chrome.bandHandle.set(true);
    inject(DestroyRef).onDestroy(() => this.chrome.bandHandle.set(false));
    // L'HYDRATATION, au seul endroit qui l'ouvre. Idempotente : revenir au rayon
    // depuis le panier ne redemande rien.
    void this.catalogue.hydrate();
  }

  /** Réessayer après un échec — le seul geste qu'un écran vide doit offrir. */
  protected retry(): void {
    void this.catalogue.hydrate();
  }

  /**
   * La flèche de retour : **l'accueil**.
   *
   * 🔴 Elle menait à l'écran du mode de service, qui n'existe plus : ses deux
   * questions se posent en dialogues, depuis l'accueil comme depuis ici. Revenir
   * en arrière depuis le rayon, c'est donc revenir là d'où l'on y est entré.
   */
  protected backToService(): void {
    void this.router.navigate(['/bienvenue']);
  }

  /**
   * Changer de maison ouvre un DIALOGUE, sans quitter le rayon : le panier est
   * composé, et partir le ferait perdre de vue.
   *
   * 🔴 Puis l'heure est REDEMANDÉE, toujours. Les créneaux appartiennent à un
   * point : une heure retenue au Labo n'existe pas forcément au Village, et la
   * garder poserait une commande que le serveur refuserait au règlement.
   */
  protected async changeHouse(): Promise<void> {
    const service = this.choice();
    const ref = PublicHousePickerDialog.open(this.panels, {
      currentId: service?.mode === 'pickup' ? service.pickupAddressId : null,
    });
    const point = await ref.closed;
    if (point === undefined) {
      return;
    }
    await this.askTime(point);
  }

  /**
   * Changer l'heure se fait SANS quitter le rayon, et sans redemander la maison.
   *
   * Le repli sur l'écran du mode de service couvre la livraison et le point par
   * défaut : il n'y a alors pas de maison sur laquelle rouvrir le sélecteur, et
   * c'est là-bas que la question se pose entièrement.
   */
  protected async changeTime(): Promise<void> {
    const service = this.choice();
    const point =
      service?.mode === 'pickup' && service.pickupAddressId !== null
        ? this.points.pickups().find((candidate) => candidate.id === service.pickupAddressId)
        : undefined;
    if (point === undefined) {
      this.backToService();
      return;
    }
    await this.askTime(point);
  }

  /**
   * Le sélecteur d'heure, puis le choix posé — la fin commune aux deux gestes.
   *
   * 🔴 Le choix ne s'écrit QU'APRÈS l'heure. Poser la maison d'abord laisserait,
   * le temps du dialogue, une maison avec l'heure de la précédente ; et refermer
   * sans choisir figerait cet état-là. Renoncer en cours de route ne change
   * donc rien : c'est ce qu'on attend d'un dialogue qu'on ferme.
   */
  private async askTime(point: PickupAddressView): Promise<void> {
    const place = point.label || point.ville;
    const ref = SlotPickerDialog.open(this.panels, {
      pickupAddressId: point.id,
      place,
      firstDay: this.points.nextDayFor(point.id),
    });
    const slot = await ref.closed;
    if (slot === undefined) {
      return;
    }
    // La même forme que `pickup-dialog` et que l'accueil : l'identité du point,
    // jamais un montant ; le libellé pour l'écran, la fenêtre pour le serveur.
    this.order.choice.set({
      mode: 'pickup',
      place,
      at: `au ${place}`,
      address: `${point.ligne1}, ${point.ville}`,
      pickupAddressId: point.id,
      slot: formatHour(slot.time),
      window: { start: slot.time, end: instantToLocal(new Date(slot.endAt)).time },
      date: slot.day,
    });
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
   * Le panier est SOUS les yeux en permanence — trois nombres dans le bandeau,
   * le détail à un geste : régler d'ici n'est pas sauter une étape, c'est ne
   * pas en inventer une.
   */
  protected async pay(): Promise<void> {
    if (this.needsService()) {
      this.backToService();
      return;
    }
    // 🔴 **ON PEUT COMMANDER SANS COMPTE** (Hugo, 2026-09-21), et cette barre
    // ne doit donc plus pousser vers Auth0. Elle poussait : « se connecter est
    // l'étape suivante, une commande a un propriétaire ». Ce n'est plus vrai —
    // `POST /shop/orders` existe, et un visiteur repart avec sa commande.
    //
    // ⚠️ **Mais on n'ouvre pas la saisie d'invité d'ici.** Le dialogue
    // d'identité ne propose QUE la saisie ; l'ouvrir en direct retirerait le
    // second chemin — se connecter — à qui a déjà un compte et ne l'a pas dit.
    // Le panier pose les deux portes côte à côte, et montre au passage ce
    // qu'on s'apprête à payer. C'est donc là qu'on envoie, et c'est la seule
    // surface qui porte cette question : deux copies finiraient par n'en
    // proposer qu'une.
    if (!this.auth.isAuthenticated()) {
      await this.openCart();
      return;
    }
    const placed = await this.orders.place();
    if (placed === null) {
      return;
    }
    // Une carte à présenter mène au règlement ; tout le reste — compte, total
    // nul — à la confirmation. La décision vient du serveur, pas de l'écran.
    void this.router.navigate(
      placed.settlement === 'due' ? ['/reglement', placed.id] : ['/confirmation-de-commande'],
    );
  }
}
