import { computed, inject, Injectable } from '@angular/core';

import { formatEuro } from '../cart-total';
import { ClientCart } from '../client-cart.service';
import { ClientOrders } from '../client-orders.service';
import { ClientCopyService } from '../copy/client-copy.service';
import { MOCK_CLIENT } from '../mock-client';
import { type WellCard } from './ready-well.model';

/** Le montant de la facture en attente — il viendra de la facturation. */
const INVOICE_AMOUNT = 248.6;

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
 */
@Injectable({ providedIn: 'root' })
export class ClientEspace {
  private readonly cart = inject(ClientCart);
  private readonly orders = inject(ClientOrders);
  private readonly t = inject(ClientCopyService).t;

  readonly cards = computed<readonly WellCard[]>(() => {
    const copy = this.t().espace;
    const cards: WellCard[] = [];

    const order = this.orders.latest();
    if (order !== null) {
      cards.push({
        id: 'pickup',
        title: copy.pickupTitle,
        icon: 'qr-code',
        lines: [
          copy.pickupRef.replace('{ref}', `#${order.reference}`),
          copy.pickupWhen.replace('{at}', order.service.at).replace('{slot}', order.service.slot),
        ],
        action: copy.pickupAction,
        // Le QR n'existe encore nulle part ; l'écran de confirmation porte déjà
        // le récap de CETTE commande, c'est donc lui qu'on ouvre en attendant.
        route: '/commande/confirmee',
        badge: '',
        primary: true,
      });
    }

    if (!this.cart.isEmpty()) {
      cards.push({
        id: 'cart',
        title: copy.cartTitle,
        icon: '',
        lines: [formatEuro(this.cart.totals().total), copy.cartWhen],
        action: copy.cartAction,
        route: '/commande/panier',
        badge: copy.cartBadge,
        primary: false,
      });
    }

    if (MOCK_CLIENT.invoicesDue > 0) {
      cards.push({
        id: 'invoice',
        title: copy.invoiceTitle,
        icon: 'receipt',
        lines: [formatEuro(INVOICE_AMOUNT), copy.invoiceDue],
        action: copy.invoiceAction,
        route: '/mes-factures',
        badge: '',
        primary: false,
      });
    }

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
