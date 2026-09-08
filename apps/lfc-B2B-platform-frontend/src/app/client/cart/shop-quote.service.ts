import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { ShopQuoteFulfillment, ShopQuotePayload, ShopQuoteView } from '@lfd/contracts';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
  tap,
  type Observable,
} from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { CartStore } from './cart.store';
import { OrderContextStore } from '../order-context.store';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/**
 * L'accalmie au bout de laquelle on chiffre, en millisecondes.
 *
 * Un panier se compose par **salves** : on clique trois fois sur « + », on
 * corrige, on ajoute une seconde pièce. Chaque geste demandait son propre
 * aller-retour, et chacun coûte au serveur quatre lectures plus une résolution
 * de prix par ligne — sur une route **publique**, donc la surface la plus
 * exposée de l'API.
 *
 * Le même délai que le panier du back-office, et pour la même raison : c'est la
 * durée d'une frappe, pas un réglage d'environnement. Diverger de trois cents
 * millisecondes entre deux paniers n'aurait eu aucune justification.
 */
const QUOTE_DEBOUNCE_MS = 300;

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
  private readonly auth = inject(AuthFacade);
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
    /**
     * **Une salve de gestes, un seul aller-retour.**
     *
     * Le décompte se redemandait à **chaque** changement de panier : six clics
     * sur « + » faisaient six appels, chacun coûtant quatre lectures et une
     * résolution de prix par ligne. C'est le multiplicateur qui compte le plus
     * ici — un facteur côté écran ne se rattrape pas en divisant une constante
     * côté serveur.
     *
     * - `distinctUntilChanged` sur la **clé** écarte ce qui ne change rien :
     *   reposer la même quantité, rouvrir le panier ;
     * - `debounceTime` écarte la **rafale** — seul l'état d'arrivée mérite un
     *   appel ;
     * - `switchMap` **annule** la requête en vol quand une nouvelle part : deux
     *   frappes rapprochées peuvent sinon revenir dans le désordre, et le panier
     *   afficherait le total de l'avant-dernier état.
     *
     * ⚠️ **Le dernier décompte reste AFFICHÉ pendant l'attente**, là où le
     * panier du back-office oublie le sien tout de suite. La divergence est
     * voulue : là-bas, un commercial lit le prix au téléphone, et un montant
     * périmé se prononce ; ici, c'est le client lui-même qui vient de cliquer,
     * il sait ce qu'il a changé, et vider le total sous ses doigts le ferait
     * clignoter à chaque pièce. L'état {@link status} dit qu'on en attend un
     * neuf ; l'écran atténue, il ne vide pas.
     */
    toObservable(this.key)
      .pipe(
        distinctUntilChanged(),
        tap((key) => {
          this.state.set(linesOf(key).length === 0 ? 'idle' : 'loading');
        }),
        debounceTime(QUOTE_DEBOUNCE_MS),
        switchMap((key) => this.ask(key)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * L'appel, ou rien quand il n'y a rien à chiffrer.
   *
   * Un échec est un ÉTAT, pas une exception qu'on avale : le dernier décompte
   * connu reste à l'écran, et l'écran peut dire qu'il est vieux. `catchError`
   * rend un flux vivant plutôt que de le rompre — une erreur ne doit pas
   * éteindre le devis pour le reste de la session.
   */
  private ask(key: string) {
    const lines = linesOf(key);
    if (lines.length === 0) {
      this.view.set(EMPTY);
      this.state.set('idle');
      return of(null);
    }
    const body = { lines, fulfillment: fulfillmentIn(key) };
    return this.quoted(body).pipe(
      tap((view) => {
        this.view.set(view);
        this.state.set('ready');
      }),
      catchError(() => {
        this.state.set('failed');
        return of(null);
      }),
    );
  }

  /**
   * **Le décompte, à la route qui correspond au lecteur.**
   *
   * Reconnu, on demande `POST /shop/quote/mine` : le serveur y résout la société
   * depuis les rattachements et applique le tarif négocié. Anonyme, la route
   * publique — c'est le parcours par défaut de la boutique, on visite d'abord.
   *
   * 🔴 Le panier doit annoncer ce qui sera FACTURÉ. Tant qu'il chiffrait au
   * tarif public, un compte sous mercuriale voyait un total qui n'était pas le
   * sien — l'écart était en sa faveur et silencieux, donc personne ne
   * réclamait, et rien de ce qu'on lui avait négocié ne lui était montré avant
   * la confirmation.
   */
  private quoted(body: {
    lines: readonly { sku: string; quantity: number }[];
    fulfillment: ReturnType<typeof fulfillmentIn>;
  }): Observable<ShopQuoteView> {
    if (!this.auth.isAuthenticated()) {
      return this.http.post<ShopQuoteView>(`${AUTH_CONFIG.apiBaseUrl}/shop/quote`, body);
    }
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.post<ShopQuoteView>(`${AUTH_CONFIG.apiBaseUrl}/shop/quote/mine`, body, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ),
    );
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
}

/** Les lignes encodées dans la clé — la clé EST la charge, pas son résumé. */
function linesOf(key: string): ShopQuotePayload['lines'] {
  return (JSON.parse(key) as { lines: ShopQuotePayload['lines'] }).lines;
}

/** Le service encodé dans la clé. */
function fulfillmentIn(key: string): ShopQuoteFulfillment | null {
  return (JSON.parse(key) as { service: ShopQuoteFulfillment | null }).service;
}
