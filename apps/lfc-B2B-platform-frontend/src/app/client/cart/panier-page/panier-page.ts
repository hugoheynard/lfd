import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { instantToLocal } from '@lfd/contracts';

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
import { RETURN_TO_CART } from '../../nouvelle-commande/commande-page/return-to-cart';

/**
 * Où Auth0 ramène, une fois l'identité obtenue : **ici**.
 *
 * Le panier vit dans le stockage local et survit à la redirection — on revient
 * donc sur la commande composée, pas sur un rayon vide.
 */
const CART = '/nouvelle-commande/panier';

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

  protected pickService(): void {
    void this.router.navigate(['/nouvelle-commande']);
  }

  /**
   * Rouvre le mode et l'heure, et **revient ici** une fois choisis.
   *
   * Sans le retour, l'écran de commande enchaîne sur le rayon : on aurait changé
   * d'heure pour se retrouver à recomposer un panier qui était déjà fait.
   */
  protected changeService(): void {
    void this.router.navigate(['/nouvelle-commande'], { queryParams: RETURN_TO_CART });
  }

  /**
   * Les deux portes de l'invite, et elles ramènent ICI.
   *
   * Le panier survit au départ chez Auth0 — il est dans le stockage local — donc
   * la personne revient sur sa commande composée, pas sur un rayon vide.
   *
   * ⚠️ **Provisoire, et c'est écrit dans le plan** (`plan-commande-sans-compte.md`
   * §12, lot A) : tant que `POST /shop/orders` n'existe pas, commander exige un
   * compte, et la porte de qui n'en a pas est l'inscription. Le jour où la route
   * publique existe, c'est la cible de {@link register} qui change — le reste de
   * cet écran, non.
   */
  protected register(): void {
    this.auth.register(CART);
  }

  protected signIn(): void {
    this.auth.login(CART);
  }

  protected backToShop(): void {
    void this.router.navigate(['/nouvelle-commande/boutique']);
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
    // Régler exige le mode : c'est lui qui porte la remise et les frais. On mène
    // à la question plutôt que de facturer un panier sans destination.
    if (this.choice() === null) {
      void this.router.navigate(['/nouvelle-commande']);
      return;
    }
    const placed = await this.orders.place();
    if (placed === null) {
      // Le refus a déjà été dit, et le panier est intact : on ne bouge pas de
      // l'écran où la correction est possible.
      return;
    }
    void this.router.navigate(
      placed.settlement === 'due'
        ? ['/nouvelle-commande/reglement', placed.id]
        : ['/nouvelle-commande/confirmee'],
    );
  }
}
