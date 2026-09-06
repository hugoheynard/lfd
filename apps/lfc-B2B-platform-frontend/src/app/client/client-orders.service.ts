import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { PlaceOrderPayload, PlacedOrderResponse, ShopQuoteView } from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { ClientCart } from './cart/client-cart.service';
import { OrderContextStore, type ServiceChoice } from './order-context.store';
import { isRecord, readLocal, readNumber, writeLocal } from './local-store';

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
  readonly totals: ShopQuoteView;
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
 * **Les commandes passées** — écrites au serveur, relues du navigateur.
 *
 * 🔴 **`place()` appelle `POST /orders` depuis le 2026-09-06.** Il fabriquait
 * une référence dans le navigateur et n'écrivait nulle part : tout ce que la
 * chaîne de prix avait construit — le devis serveur, le panier en base, les
 * prix résolus — s'arrêtait **une case avant** l'écriture. Le commentaire qui
 * tenait ici l'annonçait, et c'est ce qu'il annonçait qui est fait.
 *
 * ## Ce que le navigateur garde encore, et pourquoi
 *
 * La liste locale reste : c'est elle que la confirmation et « mon espace »
 * lisent, et elle porte le décompte tel que le client l'a vu — pas une
 * relecture. Le serveur, lui, est l'autorité sur le NUMÉRO et sur l'existence
 * de la commande. Un jour, `GET /orders/mine` remplacera cette liste ; ce
 * jour-là, la référence sera déjà la bonne.
 *
 * ## Ce qui échoue, et comment
 *
 * Un refus du serveur — heure limite dépassée, zone non livrée, SKU disparu —
 * **ne fige rien** : le panier reste plein, un message le dit, et le client peut
 * corriger. Vider le panier sur un échec serait lui faire perdre sa saisie pour
 * une raison qu'il n'a pas choisie.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrders {
  private readonly cart = inject(ClientCart);
  private readonly order = inject(OrderContextStore);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotifyService);

  private readonly placed = signal<readonly PlacedOrder[]>(readLocal(KEY, parseOrders) ?? []);

  /** La dernière passée — celle que la confirmation montre. */
  readonly latest = computed<PlacedOrder | null>(() => this.placed()[0] ?? null);

  readonly all = this.placed.asReadonly();

  /**
   * Fige le panier en commande, puis le VIDE : ce qui est payé n'est plus en
   * cours. Rend `null` quand il n'y a rien à figer — un panier vide ou un mode
   * de service perdu ne font pas une commande.
   */
  async place(): Promise<PlacedOrder | null> {
    const service = this.order.choice();
    const lines = this.cart.lines();
    if (service === null || lines.length === 0) {
      return null;
    }
    const placed = await this.send(service, lines);
    if (placed === null) {
      return null;
    }
    const order: PlacedOrder = {
      // Le numéro du SERVEUR, jamais un compteur local. C'est celui qu'un
      // client lira au téléphone et celui que la production imprimera.
      reference: placed.orderNumber,
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
   * L'appel, et son refus rendu lisible.
   *
   * `null` couvre les deux façons de ne pas commander : ne pas être reconnu, et
   * être refusé. Les deux laissent le panier intact — la seconde surtout, parce
   * qu'elle est corrigeable.
   */
  private async send(
    service: ServiceChoice,
    lines: readonly { product: { sku: string }; quantity: number }[],
  ): Promise<PlacedOrderResponse | null> {
    if (!this.auth.isAuthenticated()) {
      // Pas un échec : une étape. L'écran envoie se connecter, et le panier
      // survit — il vit en base pour qui a déjà un compte.
      return null;
    }
    const payload = payloadOf(service, lines);
    try {
      return await firstValueFrom(
        this.auth.accessToken$().pipe(
          switchMap((token) =>
            this.http.post<PlacedOrderResponse>(`${AUTH_CONFIG.apiBaseUrl}/orders`, payload, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        ),
      );
    } catch (error) {
      // `NotifyService.error` filtre déjà l'enveloppe : le message du serveur
      // quand il est sûr, ce repli sinon. Jamais un détail interne.
      this.notify.error(error, "La commande n'a pas pu être passée.");
      return null;
    }
  }
}

/**
 * Le choix de service, traduit en charge de commande.
 *
 * 🔴 **Des faits, jamais des libellés.** `place`, `at` et `slot` sont des mots
 * d'écran : ils ne partent pas. Ce qui part est ce que le serveur sait
 * recouper — un identifiant de point, une adresse complète, une journée.
 *
 * C'est le même parti que `ShopQuoteFulfillment` a pris pour l'argent : le
 * front n'envoie pas un montant, il envoie une identité. Ici il n'envoie pas
 * « au Labo, 7 h – 8 h », il envoie le point et la date.
 *
 * `requestedWindow` n'est pas envoyée : les créneaux sont une maquette et leur
 * libellé (« 7 h – 8 h ») n'est pas une fenêtre structurée. Absente veut dire
 * « aucune tranche demandée », ce qui est exact — mieux qu'une heure inventée
 * que le serveur opposerait aux horaires du point.
 */
function payloadOf(
  service: ServiceChoice,
  lines: readonly { product: { sku: string }; quantity: number }[],
): PlaceOrderPayload {
  const content = {
    // Zéro friction : la commande appartient au client, pas à une société.
    companyId: null,
    requestedDeliveryDate: service.date,
    note: '',
    lines: lines.map((line) => ({ sku: line.product.sku, quantity: line.quantity })),
    deliveryAddressId: null,
  };
  if (service.mode === 'pickup') {
    return {
      ...content,
      fulfillmentMethod: 'pickup' as const,
      pickupAddressId: service.pickupAddressId,
      deliveryAddress: null,
    };
  }
  return {
    ...content,
    fulfillmentMethod: 'delivery' as const,
    pickupAddressId: null,
    deliveryAddress: service.deliveryAddress,
  };
}
