import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { ShopQuoteFulfillment, ShopQuotePayload, ShopQuoteView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { CartStore } from './cart.store';
import { OrderContextStore } from '../order-context.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/** Où en est le décompte. `idle` = rien à chiffrer, le panier est vide. */
export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Le décompte d'un panier vide — ce qu'on montre avant la première réponse. */
const EMPTY: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 0,
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  vat: [],
  totalCents: 0,
};

/**
 * **Le décompte du panier, tel que le SERVEUR le rend.**
 *
 * ## Ce qu'il remplace, et pourquoi ça ne pouvait pas rester
 *
 * Le panier calculait ses montants dans le navigateur : `prix × quantité`, une
 * remise en pourcentage tirée d'une maquette, des frais de zone en euros
 * flottants, et une TVA recalculée à côté de celle du serveur. Quatre nombres,
 * quatre occasions de diverger de la facture — et
 * `architecture-prix-boutique.md` §6 l'interdisait déjà par écrit :
 *
 * > le front **ne multiplie jamais**. Il demande une route qui résout chaque
 * > ligne à sa quantité réelle.
 *
 * La multiplication est exacte tant qu'aucun palier n'existe, et fausse **en
 * silence** le jour où un barème ouvert à tous est posé : elle continue de
 * rendre un nombre plausible.
 *
 * ## Ce qu'il ne décide pas
 *
 * Rien. Ni la remise, ni les frais, ni la TVA, ni l'arrondi. Il envoie des SKU,
 * des quantités et le service retenu ; il affiche ce qui revient. C'est la seule
 * forme qui garantit qu'un client voit ce qu'il paiera.
 *
 * ## Le dernier décompte reste affiché pendant qu'on en demande un autre
 *
 * Remettre les montants à zéro à chaque frappe ferait clignoter le total sous
 * les doigts. Le panier garde donc le dernier chiffre connu et signale par
 * {@link status} qu'il en attend un neuf — l'écran atténue, il ne vide pas.
 */
@Injectable({ providedIn: 'root' })
export class ShopQuote {
  private readonly http = inject(HttpClient);
  private readonly store = inject(CartStore);
  private readonly order = inject(OrderContextStore);
  private readonly catalogue = inject(ShopCatalogue);

  private readonly view = signal<ShopQuoteView>(EMPTY);
  private readonly state = signal<QuoteStatus>('idle');

  readonly totals = this.view.asReadonly();
  readonly status = this.state.asReadonly();

  /**
   * Ce dont le décompte dépend, et **rien d'autre**.
   *
   * Une clé plutôt que les signaux bruts : sans elle, tout changement du
   * contexte de commande — le créneau choisi, le nom du lieu — relancerait une
   * requête qui rendrait exactement les mêmes nombres.
   */
  private readonly key = computed(() => {
    const lines = this.payloadLines();
    const service = this.fulfillmentOf();
    return JSON.stringify({ lines, service });
  });

  constructor() {
    // Le catalogue garde la porte : une quantité posée sur une référence qu'il
    // ne connaît pas n'a pas de ligne, donc pas de devis à demander.
    effect(() => {
      const key = this.key();
      void this.refresh(key);
    });
  }

  /**
   * Les lignes à chiffrer, dans l'ordre du rayon.
   *
   * Projetées à travers le catalogue pour la même raison que `ClientCart.lines`
   * : une référence retirée de la vente ne doit pas partir au serveur, qui la
   * refuserait et ferait échouer tout le décompte pour une ligne morte.
   */
  private payloadLines(): ShopQuotePayload['lines'] {
    const quantities = this.store.quantities();
    return this.catalogue
      .items()
      .filter((item) => (quantities[item.sku] ?? 0) > 0)
      .map((item) => ({ sku: item.sku, quantity: quantities[item.sku] ?? 0 }));
  }

  /**
   * Le service retenu, sous la forme que le serveur attend : **une identité**,
   * jamais un montant.
   *
   * Le front ne dit plus « remise de 10 % » — il dit « ce point de retrait ».
   * C'est ce qui rend impossible l'écart qu'on répare : il n'a plus de chiffre
   * à se tromper.
   */
  private fulfillmentOf(): ShopQuoteFulfillment | null {
    const choice = this.order.choice();
    if (choice === null) {
      return null;
    }
    return choice.mode === 'pickup'
      ? { method: 'pickup', pickupAddressId: choice.pickupAddressId }
      : { method: 'delivery', codePostal: choice.codePostal };
  }

  private async refresh(key: string): Promise<void> {
    const { lines, service } = JSON.parse(key) as {
      lines: ShopQuotePayload['lines'];
      service: ShopQuoteFulfillment | null;
    };
    if (lines.length === 0) {
      this.view.set(EMPTY);
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    try {
      const view = await firstValueFrom(
        this.http.post<ShopQuoteView>(`${AUTH_CONFIG.apiBaseUrl}/shop/quote`, {
          lines,
          fulfillment: service,
        }),
      );
      // La réponse d'une clé PÉRIMÉE se jette : deux frappes rapprochées
      // partent dans l'ordre et peuvent revenir dans l'autre, et le panier
      // afficherait alors le total de l'avant-dernier état.
      if (this.key() === key) {
        this.view.set(view);
        this.state.set('ready');
      }
    } catch {
      // Un échec est un ÉTAT, pas une exception qu'on avale : le dernier
      // décompte connu reste à l'écran, et l'écran peut dire qu'il est vieux.
      if (this.key() === key) {
        this.state.set('failed');
      }
    }
  }
}
