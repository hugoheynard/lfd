import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { instantToLocal } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';

import { GuestIdentityDialog } from '../guest-identity-dialog/guest-identity-dialog';

import { AuthFacade } from '../../../auth/auth.facade';
import { formatCents } from '../../format-money';
import { ClientCart } from '../client-cart.service';
import { ClientChrome } from '../../client-chrome.service';
import { ClientLocale } from '../../client-locale.service';
import { serviceDayLabel } from '../../format-day';
import { OrderContextStore } from '../../order-context.store';
import { ClientOrders } from '../../client-orders.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { CartSummary } from '../cart-summary/cart-summary';
import { OrderDoors } from '../../shop/order-doors';

/**
 * Où Auth0 ramène, une fois l'identité obtenue : **ici**.
 *
 * Le panier vit dans le stockage local et survit à la redirection — on revient
 * donc sur la commande composée, pas sur un rayon vide.
 */
const CART = '/commande/panier';

/**
 * Le panier, en pile — ce que le bureau montre dans sa colonne de droite.
 *
 * Il ne redemande rien : le lieu et le créneau sont déjà pris, ils se rappellent
 * en tête de page — et « Modifier » les rouvre sans perdre le panier. Le seul geste qui reste est de régler, et le bouton porte le
 * montant plutôt que de le laisser deviner.
 */
@Component({
  selector: 'app-panier-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartSummary],
  templateUrl: './panier-page.html',
  styleUrl: './panier-page.scss',
})
export class PanierPage {
  private readonly chrome = inject(ClientChrome);
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

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerCart);
    this.chrome.back.set((): void => this.backToShop());
  }

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
    void this.router.navigate(
      placed.settlement === 'due' ? ['/commande/reglement', placed.id] : ['/commande/confirmee'],
    );
  }

  /** La porte de qui a déjà un compte. Elle ramène ICI, panier compris. */
  protected signInFirst(): void {
    this.auth.login(CART);
  }

  protected signIn(): void {
    this.auth.login(CART);
  }

  protected backToShop(): void {
    void this.router.navigate(['/boutique']);
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
    void this.router.navigate(
      placed.settlement === 'due' ? ['/commande/reglement', placed.id] : ['/commande/confirmee'],
    );
  }
}
