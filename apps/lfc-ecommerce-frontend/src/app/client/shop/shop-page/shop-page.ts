import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ShopStore } from '../shop.store';
import { ClientLocale } from '../../client-locale.service';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { serviceWhenLabel } from '../../format-day';
import { formatHour } from '../../format-hour';
import { ServicePoints } from '../pickup-points.store';
import { SlotPickerDialog } from '../slot-picker-dialog/slot-picker-dialog';
import { PublicCommandTermsSummary } from '../public-command-terms-summary/public-command-terms-summary';
import { PublicHousePickerDialog } from '../public-house-picker-dialog/public-house-picker-dialog';
import { PublicSteps } from '../public-steps/public-steps';
import { CartBar } from '../../cart/cart-bar/cart-bar';
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
    CartBar,
    PublicCommandTermsSummary,
    PublicSteps,
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
  private readonly panels = inject(FoldPanelHostService);
  private readonly points = inject(ServicePoints);
  private readonly locale = inject(ClientLocale);
  private readonly orders = inject(ClientOrders);
  private readonly auth = inject(AuthFacade);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  /** Au niveau `browse` exactement, la fiche porte une mention au lieu du geste d'ajout (plan §4). */
  protected readonly access = inject(ClientFeatureAccess);

  protected readonly shop = inject(Shop);
  private readonly catalogue = inject(ShopCatalogue);

  /** La pièce dont la fiche est ouverte. */
  protected readonly openPiece = signal<string | null>(null);

  /** Le rayon dont la feuille « En savoir plus » est ouverte. */
  protected readonly openStory = signal<string | null>(null);

  /** Le tiroir du panier. Fermé en arrivant : on vient voir le rayon. */

  protected readonly choice = this.order.choice;

  /**
   * Le titre de la barre du bas : le GESTE, pas le compte.
   *
   * 🔴 Elle ouvrait un panneau et annonçait « N pièces au panier ». Elle mène
   * maintenant au règlement (Hugo, 2026-09-21) — et une barre qui nomme un
   * décompte pour faire tout autre chose ment sur ce qui va se passer.
   */
  protected readonly cartLabel = computed(() => this.t().shop.cartBar);

  protected readonly payLabel = computed(() =>
    fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) }),
  );

  /**
   * **Ce qui a été répondu**, pour le rail des étapes — la maison, puis le
   * moment. La troisième reste `null` : on est en train d'y répondre.
   *
   * 🔴 Une réponse remplace la promesse de l'étape. « La maison qui vous
   * arrange » situe tant qu'on n'a pas choisi ; une fois Le Labo retenu, c'est
   * « Le Labo » qu'on vient relire. Sans service pris, rien n'est répondu et le
   * rail garde ses promesses.
   */
  protected readonly stepAnswers = computed<readonly (string | null)[]>(() => {
    const service = this.choice();
    if (service === null) {
      return [];
    }
    const copy = commandTermsCopy(this.locale.current());
    const when = serviceWhenLabel(
      service.date,
      service.slot,
      instantToLocal(new Date()).day,
      this.locale.current(),
      { today: copy.today, tomorrow: copy.tomorrow },
    );
    return [service.place, when, null];
  });

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
      this.auth.login('/boutique');
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
