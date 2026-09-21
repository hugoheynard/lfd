import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { instantToLocal } from '@lfd/contracts';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { GuestIdentityDialog } from '../guest-identity-dialog/guest-identity-dialog';

import { AuthFacade } from '../../../auth/auth.facade';
import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { ClientLocale } from '../../client-locale.service';
import { serviceDayLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';
import { ClientOrders } from '../../client-orders.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { dialogSide } from '../../panel-side';
import { CartSummary } from '../cart-summary/cart-summary';
import { OrderDoors } from '../../shop/order-doors';

/**
 * Où Auth0 ramène, une fois l'identité obtenue : **le rayon**.
 *
 * 🔴 C'était le panier, tant qu'il avait une adresse. Il n'en a plus : un
 * dialogue ne se restaure pas au retour d'une redirection. Le panier, lui,
 * survit — il vit dans le stockage local — et se rouvre d'un geste depuis la
 * barre, où sa pastille porte déjà son compte.
 */
const AFTER_SIGN_IN = '/boutique';

/**
 * **Le panier, en dialogue** (Hugo, 2026-09-21 : « le panier devient un dialog
 * comme le reste »).
 *
 * 🔴 Il était un ÉCRAN, et c'est ce qui coûtait : on quittait le rayon pour
 * relire ce qu'on venait d'y mettre, puis il fallait y revenir. Trois surfaces
 * disaient la même chose — la page, le popover de la barre au bureau, et le
 * lien de la pastille en pile. Il n'en reste qu'une, et elle s'ouvre par-dessus
 * ce qu'on était en train de faire.
 *
 * Il ne redemande rien : le lieu et le créneau sont déjà pris, ils se rappellent
 * en tête — et « Modifier » les rouvre sans fermer le panier. Le seul geste qui
 * reste est de régler, et le bouton porte le montant plutôt que de le laisser
 * deviner.
 *
 * ⚠️ **Ce qui sort d'ici NAVIGUE, et referme donc le dialogue** : le règlement
 * et la confirmation sont des écrans, parce qu'une commande existe déjà quand
 * on y arrive et que leur adresse doit survivre à un rechargement.
 */
@Component({
  selector: 'app-cart-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CartSummary,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './cart-dialog.html',
  styleUrl: './cart-dialog.scss',
})
export class CartDialog {
  static readonly foldPanel: FoldPanelDefaults = {
    side: 'center',
    // `lg` : des lignes de produit avec quantité, prix unitaire et total
    // doivent tenir sans se replier — c'est la contrainte la plus forte de ce
    // dialogue, et la seule qui décide de sa largeur.
    width: 'lg',
    surface: 'solid',
  };

  /** Ouvre le panier. Il ne rend rien : ce qu'on y décide part par le routeur. */
  static open(panels: FoldPanelHostService): FoldPanelRef<void> {
    return panels.open<undefined, void>(CartDialog, {
      side: dialogSide(),
      stack: true,
      data: undefined,
    });
  }

  /**
   * ⚠️ Déclarée sans jamais être lue, et c'est le CONTRAT DE FOLD qui l'exige :
   * `FoldPanelContent` n'a que des membres facultatifs, et TypeScript refuse un
   * type « faible » auquel une classe n'apporte aucune propriété commune. Ce
   * panneau n'a rien à recevoir — le panier vit dans son magasin, et c'est tout
   * l'intérêt : on l'ouvre d'où l'on veut sans rien lui passer.
   */
  readonly data = input<undefined>();

  private readonly ref = inject(FoldPanelRef);

  private readonly router = inject(Router);
  private readonly order = inject(OrderContextStore);
  private readonly orders = inject(ClientOrders);
  /** L'hôte des panneaux fold : c'est lui qui ouvre la saisie du visiteur. */
  private readonly panels = inject(FoldPanelHostService);

  /** Les portes du mode de service — les mêmes que l'accueil ouvre. */
  private readonly doors = inject(OrderDoors);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly cart = inject(ClientCart);
  protected readonly choice = this.order.choice;
  private readonly locale = inject(ClientLocale);
  private readonly auth = inject(AuthFacade);

  /**
   * **Ce qui manque pour régler : savoir qui commande.**
   *
   * 🔴 `isLoading()` passe AVANT `isAuthenticated()`, et ce n'est pas un détail
   * de prudence. Le SDK Auth0 résout la session au premier chargement, et
   * `isAuthenticated` vaut `false` pendant ce temps-là **pour un client bel et
   * bien connecté** : sans cette garde, l'invite « Qui passe cette commande ? »
   * clignoterait devant un abonné, à l'écran le plus sensible du tunnel.
   *
   * C'est la même précaution que `featureAccessGuard` prend, pour la même
   * raison — et elle y est écrite.
   */
  private readonly unknownCustomer = computed(
    () => !this.auth.isLoading() && !this.auth.isAuthenticated(),
  );

  /**
   * Le règlement est-il retenu faute de savoir qui commande ?
   *
   * La question ne se pose que devant une commande réglable : un panier vide
   * rouvre le rayon, un panier sans mode de service mène à la question du lieu.
   * Réclamer une identité avant ces deux-là demanderait qui vous êtes à
   * quelqu'un qui n'a encore rien à acheter.
   */
  protected readonly identityNeeded = computed(
    () => this.unknownCustomer() && !this.cart.isEmpty() && this.choice() !== null,
  );

  /**
   * « demain · créneau choisi », avec la VRAIE journée : celle que le serveur a
   * accordée au point, et non « demain » écrit en dur.
   *
   * Aujourd'hui se lit à l'horloge du navigateur, à Paris : c'est un libellé, et
   * seul un onglet laissé ouvert passé minuit pourrait le décaler d'un mot.
   */
  protected readonly slotNote = computed(() => {
    const service = this.choice();
    if (service === null) {
      return '';
    }
    const c = this.t().cart;
    const day = serviceDayLabel(
      service.date,
      instantToLocal(new Date()).day,
      this.locale.current(),
      {
        today: c.dayToday,
        tomorrow: c.dayTomorrow,
      },
    );
    return fill(c.slotNote, { day });
  });

  /**
   * Le bouton nomme la SUITE, et elle dépend de ce qui manque : un panier vide
   * renvoie au rayon, un panier sans mode de service renvoie à la question, et
   * un panier prêt porte le montant.
   */
  protected readonly ctaLabel = computed(() => {
    if (this.cart.isEmpty()) {
      return this.t().cart.browse;
    }
    if (this.choice() === null) {
      return this.t().shop.pickService;
    }
    return fill(this.t().cart.pay, { total: formatCents(this.cart.totals().totalCents) });
  });

  /**
   * **Le mode de service se choisit ICI, en dialogues** (2026-09-21).
   *
   * 🔴 Les deux gestes menaient à `/nouvelle-commande`, et le second devait
   * emporter un `RETURN_TO_CART` pour revenir : sans lui, l'écran de commande
   * enchaînait sur le rayon, et on avait changé d'heure pour se retrouver à
   * recomposer un panier qui était déjà fait. Ce paramètre de retour était la
   * preuve que le détour n'avait pas lieu d'être — on ne fabrique pas un
   * chemin de retour vers l'endroit qu'on n'aurait pas dû quitter.
   *
   * ⚠️ Le retrait seulement : la porte du coursier demande un carnet
   * d'adresses, que seul un compte possède. Un visiteur n'en a pas, et c'est
   * l'accueil qui tranche entre les deux portes — le panier, lui, n'a qu'à
   * rouvrir celle qu'on a déjà prise.
   */
  protected async pickService(): Promise<void> {
    await this.doors.pickup(null);
  }

  /** Rouvre le choix déjà fait, sans quitter le panier. */
  protected async changeService(): Promise<void> {
    const service = this.choice();
    if (service === null) {
      await this.doors.pickup(null);
      return;
    }
    if (service.mode === 'delivery') {
      await this.doors.delivery(null);
      return;
    }
    // Changer de maison périme l'heure : on rouvre les deux, dans l'ordre.
    await this.doors.pickup(service.pickupAddressId);
  }

  /**
   * **La porte de qui n'a pas de compte : commander sans en créer un.**
   *
   * 🔴 Elle menait à l'inscription Auth0, faute de route publique — c'est ce que
   * disait ce JSDoc, et ce n'est plus vrai : `POST /shop/orders` est branchée.
   * Un visiteur déclare qui il est, et repart avec sa commande ; il n'a aucune
   * identité de connexion, et rien de ce qu'il tape ici n'ouvre quoi que ce soit.
   *
   * ⚠️ **Le dialogue peut se fermer sans rien rendre**, et fermer n'est pas
   * commander : on reste alors sur le panier, intact, sans rien avoir envoyé.
   *
   * ## La suite : on PAIE, puis on confirme
   *
   * Exactement le chemin du client connecté ({@link proceed}), et il est
   * praticable sans compte parce que `POST /shop/orders` rend l'intention
   * Stripe **avec** la commande : l'écran de règlement la reçoit de la mémoire
   * et ne redemande rien à `GET /orders/:id/payment`, qui est murée.
   *
   * ⚠️ **La commande existe AVANT le paiement**, des deux côtés : écrite au
   * serveur par le `201`, rangée dans le navigateur par `placeAsGuest`. Un
   * règlement qui aboutit ne peut donc pas retomber sur une commande
   * introuvable, et un règlement abandonné laisse une commande à payer — pas un
   * panier fantôme.
   */
  protected async orderAsGuest(): Promise<void> {
    const buyer = await GuestIdentityDialog.open(this.panels).closed;
    if (buyer === undefined) {
      return;
    }
    const placed = await this.orders.placeAsGuest(buyer);
    if (placed === null) {
      // Le refus a déjà été dit, et le panier est intact.
      return;
    }
    this.leaveFor(placed);
  }

  /** La porte de qui a déjà un compte. Elle ramène ICI, panier compris. */
  protected signInFirst(): void {
    this.auth.login(AFTER_SIGN_IN);
  }

  protected signIn(): void {
    this.auth.login(AFTER_SIGN_IN);
  }

  /** Rouvrir le rayon, c'est simplement refermer le panier : on y était. */
  protected backToShop(): void {
    this.ref.close();
  }

  /**
   * Passe la commande, puis mène là où elle en est.
   *
   * 🔴 **Le résultat de `place()` n'était pas attendu.** La méthode est
   * asynchrone depuis qu'elle écrit au serveur ; `place() !== null` comparait
   * une *promesse* à `null`, donc toujours vrai. Un refus du serveur — heure
   * limite dépassée, zone non desservie, SKU disparu — menait quand même à
   * l'écran « c'est réglé », pour une commande qui n'existait pas.
   *
   * La suite dépend de ce que le serveur a décidé du règlement : une carte à
   * présenter mène au règlement, tout le reste à la confirmation.
   */
  protected async proceed(): Promise<void> {
    if (this.cart.isEmpty()) {
      this.backToShop();
      return;
    }
    // Régler exige le mode : c'est lui qui porte la remise et les frais. On
    // POSE la question plutôt que de facturer un panier sans destination — et
    // si elle reste sans réponse, on ne va nulle part.
    if (this.choice() === null) {
      await this.pickService();
      if (this.choice() === null) {
        return;
      }
    }
    const placed = await this.orders.place();
    if (placed === null) {
      // Le refus a déjà été dit, et le panier est intact : on ne bouge pas de
      // l'écran où la correction est possible.
      return;
    }
    this.leaveFor(placed);
  }

  /**
   * La suite dépend de ce que le SERVEUR a décidé du règlement : une carte à
   * présenter mène au règlement, tout le reste à la confirmation. Les deux sont
   * des écrans, donc le dialogue se ferme.
   */
  private leaveFor(placed: { readonly id: string; readonly settlement: string }): void {
    this.ref.close();
    void this.router.navigate(
      placed.settlement === 'due' ? ['/reglement', placed.id] : ['/confirmation-de-commande'],
    );
  }
}
