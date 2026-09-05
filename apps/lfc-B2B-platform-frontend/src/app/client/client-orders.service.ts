import { computed, inject, Injectable, signal } from '@angular/core';

import { type CartTotals } from './cart/cart-total';
import { ClientCart } from './cart/client-cart.service';
import { OrderContextStore, type ServiceChoice } from './order-context.store';
import { isRecord, readLocal, readNumber, writeLocal } from './local-store';
import { unitPriceCents } from '@lfd/money';
import { MOCK_ORDER_REF } from './shop/mock-order';

/** Une ligne figée : le nom et le prix du jour, pas une référence au catalogue. */
export interface PlacedLine {
  readonly name: string;
  readonly quantity: number;
  /** En **centimes HT**, figé : le prix payé ce jour-là, pas celui d'aujourd'hui. */
  readonly unitPriceCents: number;
}

/**
 * Une commande passée.
 *
 * Tout y est FIGÉ, y compris les noms et les prix : une commande relue six mois
 * plus tard doit dire ce qu'on a payé ce jour-là, pas ce que le catalogue coûte
 * aujourd'hui. C'est la différence entre un reçu et une jointure.
 */
export interface PlacedOrder {
  readonly reference: string;
  readonly service: ServiceChoice;
  readonly lines: readonly PlacedLine[];
  readonly pieces: number;
  readonly totals: CartTotals;
}

const KEY = 'orders';

function parseOrders(raw: unknown): readonly PlacedOrder[] | null {
  return Array.isArray(raw) ? raw.filter(isPlaced) : null;
}

/** Une commande relue n'est gardée que si elle porte encore de quoi la lire. */
function isPlaced(value: unknown): value is PlacedOrder {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['reference'] === 'string' &&
    isRecord(value['service']) &&
    isRecord(value['totals']) &&
    Array.isArray(value['lines']) &&
    readNumber(value['pieces']) !== null
  );
}

/**
 * Les commandes passées de la maquette.
 *
 * ⚠️ Elles vivent dans le NAVIGATEUR. Passer une commande de démonstration ne
 * doit rien écrire dans les données de l'entreprise — ni commande, ni paiement,
 * ni ligne de production. Le jour où la vraie commande arrive, `place()` appelle
 * l'API et le reste de l'app ne bouge pas.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrders {
  private readonly cart = inject(ClientCart);
  private readonly order = inject(OrderContextStore);

  private readonly placed = signal<readonly PlacedOrder[]>(readLocal(KEY, parseOrders) ?? []);

  /** La dernière passée — celle que la confirmation montre. */
  readonly latest = computed<PlacedOrder | null>(() => this.placed()[0] ?? null);

  readonly all = this.placed.asReadonly();

  /**
   * Fige le panier en commande, puis le VIDE : ce qui est payé n'est plus en
   * cours. Rend `null` quand il n'y a rien à figer — un panier vide ou un mode
   * de service perdu ne font pas une commande.
   */
  place(): PlacedOrder | null {
    const service = this.order.choice();
    const lines = this.cart.lines();
    if (service === null || lines.length === 0) {
      return null;
    }
    const order: PlacedOrder = {
      reference: this.nextReference(),
      service,
      lines: lines.map((line) => ({
        name: line.product.name,
        quantity: line.quantity,
        // FIGÉ à la passation, en centimes HORS TAXE : une commande passée doit
        // dire le prix qu'elle a coûté, pas celui que le catalogue affiche
        // aujourd'hui. C'est le même raisonnement — et la même unité — que le
        // serveur applique à sa ligne de commande.
        unitPriceCents: unitPriceCents(line.product.unitPriceMillicents),
      })),
      pieces: this.cart.count(),
      totals: this.cart.totals(),
    };
    this.placed.update((all) => [order, ...all]);
    writeLocal(KEY, this.placed());
    this.cart.clear();
    return order;
  }

  /**
   * Le numéro suit le compteur des commandes déjà passées, à partir de celui de
   * la réf. Pas de tirage au sort : un identifiant aléatoire changerait entre le
   * rendu serveur et l'hydratation, et l'écran clignoterait.
   */
  private nextReference(): string {
    return String(Number(MOCK_ORDER_REF) + this.placed().length);
  }
}
