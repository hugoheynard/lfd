import { computed, inject, Injectable } from '@angular/core';

import { formatCents } from '../format-money';
import { ClientCart } from '../cart/client-cart.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { isLive, placeOf, windowOf } from '../mes-commandes/order-rows';
import { type WellCard } from './ready-well.model';

/**
 * Ce qui attend une action, et rien d'autre.
 *
 * C'est LA question à laquelle l'accueil connecté répond, et c'est pour ça que
 * ce service ne lit que des sources d'action : une commande passée, un panier
 * ouvert, une facture due. Rien de ce qui relève de la consultation — remise,
 * encours, KBIS — n'entre ici ; ça vit dans « Mon compte ».
 *
 * Le compteur et les cartes viennent du MÊME calcul. La réf y tient : le badge
 * annonce un nombre d'actions, pas un nombre de notifications, et deux
 * comptages séparés finiraient par se contredire.
 *
 * 🔴 **La commande venait du `localStorage`.** Cet accueil lisait `ClientOrders`
 * — la liste que le navigateur garde depuis la passation — pendant que « Mes
 * commandes » lisait le serveur. Deux vérités sur le même client : vider le
 * stockage, ou simplement changer d'appareil, faisait disparaître d'ici une
 * commande bien réelle. Il lit désormais la MÊME source que l'écran des
 * commandes, et la carte mène au vrai QR plutôt qu'à un récapitulatif.
 */
@Injectable({ providedIn: 'root' })
export class ClientEspace {
  private readonly cart = inject(ClientCart);
  private readonly history = inject(ClientOrderHistory);
  private readonly t = inject(ClientCopyService).t;

  readonly cards = computed<readonly WellCard[]>(() => {
    const copy = this.t().espace;
    const cards: WellCard[] = [];

    // Ce qui est EN ROUTE, pas ce qui est passé : un accueil qui n'annonce que
    // des actions n'a rien à faire d'une commande déjà remise.
    const live = this.history.orders().find(isLive);
    if (live !== undefined) {
      cards.push({
        id: 'pickup',
        title: copy.pickupTitle,
        icon: 'qr-code',
        lines: [
          copy.pickupRef.replace('{ref}', `#${live.orderNumber}`),
          // Le lieu et la tranche viennent des MÊMES dérivations que le suivi :
          // deux mises en forme du même fait se contredisent sur l'écran qui
          // les lit le moins.
          copy.pickupWhen
            .replace('{at}', placeOf(live))
            .replace('{slot}', windowOf(live) || this.t().orders.noWindow),
        ],
        action: copy.pickupAction,
        // Le QR a son écran depuis le lot 4 : la carte y mène directement, au
        // lieu du récapitulatif qui servait de pis-aller.
        route: `/mes-commandes/retrait/${live.id}`,
        badge: '',
        primary: true,
      });
    }

    if (!this.cart.isEmpty()) {
      cards.push({
        id: 'cart',
        title: copy.cartTitle,
        icon: '',
        lines: [formatCents(this.cart.totals().totalCents), copy.cartWhen],
        action: copy.cartAction,
        route: '/nouvelle-commande/panier',
        badge: copy.cartBadge,
        primary: false,
      });
    }

    // 🔴 **La carte « facture à régler » est partie.** Elle annonçait 248,60 €
    // dus, un montant écrit en dur à côté d'une constante `invoicesDue: 1`.
    // Aucune facture n'est émise dans ce système : la carte envoyait vers un
    // écran vide, et un accueil qui réclame un règlement qui n'existe pas est
    // pire qu'un accueil qui ne réclame rien.
    //
    // Elle revient le jour où la facturation existe — c'est ici, et l'écran
    // saura alors ce qu'il annonce.

    return cards;
  });

  /** Le nombre d'actions en attente — ce que le badge bleu annonce. */
  readonly count = computed(() => this.cards().length);

  /** La seconde ligne du titre : la réf l'écrit en toutes lettres, pas en chiffre. */
  readonly todayLine = computed(() => {
    const copy = this.t().espace;
    return copy.today[this.count() - 1] ?? copy.todayNone;
  });

  readonly lead = computed(() => {
    const copy = this.t().espace;
    return this.count() === 0 ? copy.leadNone : copy.lead;
  });

  /** Le nombre de pièces du panier, pour la pastille de la carte. */
  readonly cartPieces = computed(() => this.cart.count());
}
