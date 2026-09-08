import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  OrderPaymentIntent,
  OrderSettlement,
  PlaceOrderPayload,
  PlacedOrderResponse,
  ShopQuoteView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { unitPriceCents } from '@lfd/money';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import { ClientCart } from './cart/client-cart.service';
import { OrderContextStore, type ServiceChoice } from './order-context.store';
import { clearLocal, isRecord, readLocal, readNumber, readString, writeLocal } from './local-store';

/** Une ligne figée : le nom et le prix du jour, pas une référence au catalogue. */
export interface PlacedLine {
  readonly name: string;
  readonly quantity: number;
  /** En **centimes HT**, figé : le prix payé ce jour-là, pas celui d'aujourd'hui. */
  readonly unitPriceCents: number;
}

/**
 * **Ce que la commande attend encore, côté règlement.**
 *
 * Trois états, et pas un booléen : « pas payé » recouvrait deux situations que
 * l'écran de confirmation doit dire différemment. Une commande portée au compte
 * n'attend RIEN du client ; une commande carte non réglée attend son geste.
 * Les confondre, c'est soit réclamer de l'argent à qui n'en doit pas, soit
 * laisser partir sans payer qui le devait.
 */
export type Settlement = 'not_required' | 'due' | 'paid';

/**
 * Une commande passée.
 *
 * Tout y est FIGÉ, y compris les noms et les prix : une commande relue six mois
 * plus tard doit dire ce qu'on a payé ce jour-là, pas ce que le catalogue coûte
 * aujourd'hui. C'est la différence entre un reçu et une jointure.
 *
 * `settlement` est la seule chose qui BOUGE après coup — de `due` à `paid` —, et
 * c'est normal : le règlement est un fait postérieur à la commande, pas une de
 * ses lignes.
 */
export interface PlacedOrder {
  /** L'identifiant SERVEUR — la cible de `GET /orders/:id/payment`. */
  readonly id: string;
  readonly reference: string;
  readonly service: ServiceChoice;
  readonly lines: readonly PlacedLine[];
  readonly pieces: number;
  readonly totals: ShopQuoteView;
  readonly settlement: Settlement;
}

const KEY = 'orders';

/**
 * Où vit la **clé d'idempotence** de la tentative en cours.
 *
 * Dans le stockage, et pas dans un signal : la promesse est de couvrir le retour
 * arrière du navigateur et le rechargement, et une clé tenue en mémoire est
 * perdue par les deux — donc la deuxième tentative passerait une deuxième
 * commande, ce qui est exactement le défaut qu'on ferme.
 *
 * Elle survit à l'échec (le rejeu doit porter la MÊME clé) et meurt au succès :
 * la commande suivante est une commande suivante.
 */
const ATTEMPT_KEY = 'order-attempt';

/** Le refus que le serveur oppose à un appel identique encore en vol. */
const IN_FLIGHT = 'orders.idempotency.in_flight';

function parseOrders(raw: unknown): readonly PlacedOrder[] | null {
  return Array.isArray(raw) ? raw.filter(isPlaced) : null;
}

/** Les trois états de règlement, pour reconnaître une valeur relue du navigateur. */
const SETTLEMENTS: readonly string[] = ['not_required', 'due', 'paid'];

/**
 * Une commande relue n'est gardée que si elle porte encore de quoi la lire.
 *
 * 🔴 **`id` et `settlement` sont exigés**, ce qui écarte les commandes écrites
 * avant que le règlement existe. C'est délibéré : on ne sait pas si elles ont
 * été payées, et leur poser un état par défaut ferait dire à l'écran de
 * confirmation soit « réglé » soit « à régler » sur la foi de rien. Le serveur
 * garde ces commandes ; « Mes commandes » les lit. Ce cache-ci perd une entrée,
 * pas une commande.
 */
function isPlaced(value: unknown): value is PlacedOrder {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['id'] === 'string' &&
    typeof value['reference'] === 'string' &&
    typeof value['settlement'] === 'string' &&
    SETTLEMENTS.includes(value['settlement']) &&
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
 *
 * ## Le règlement n'est pas la passation
 *
 * 🔴 **La réponse portait une intention de paiement que personne ne lisait.**
 * Le serveur crée l'intention Stripe AVANT d'écrire la commande et la rend dans
 * `payment` ; `place()` n'en prenait que le numéro. Chaque commande client
 * partait donc en `pending` derrière une intention que rien ne présentait, et
 * l'écran suivant annonçait « c'est réglé ». Le règlement est désormais une
 * ÉTAPE — `/nouvelle-commande/reglement/:id` — et la commande dit lequel des
 * trois états elle porte.
 */
@Injectable({ providedIn: 'root' })
export class ClientOrders {
  private readonly cart = inject(ClientCart);
  private readonly order = inject(OrderContextStore);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotifyService);

  private readonly placed = signal<readonly PlacedOrder[]>(readLocal(KEY, parseOrders) ?? []);

  /**
   * L'intention rendue à la passation, gardée le temps d'un écran.
   *
   * Elle évite à la page de règlement un aller-retour, et surtout un second
   * appel à Stripe pour un secret qu'on vient de recevoir. Elle n'est pas
   * persistée : un secret de paiement n'a rien à faire dans le stockage du
   * navigateur, et la page sait le redemander (`GET /orders/:id/payment`) quand
   * elle ne l'a plus — un rechargement, un lien rouvert plus tard.
   */
  private readonly intent = signal<{ orderId: string; payment: OrderPaymentIntent } | null>(null);

  /** La dernière passée — celle que la confirmation montre. */
  readonly latest = computed<PlacedOrder | null>(() => this.placed()[0] ?? null);

  readonly all = this.placed.asReadonly();

  /**
   * **La clé de la tentative en cours**, fabriquée une fois puis relue.
   *
   * Elle ne se régénère PAS à chaque appel : c'est ce qui fait qu'un double
   * clic, un rejeu réseau ou un retour arrière sont reconnus comme la même
   * tentative — et qu'un panier corrigé, lui, part sous la même clé mais avec
   * une empreinte différente, que le serveur refuse plutôt que d'honorer.
   */
  private attemptKey(): string {
    const held = readLocal(ATTEMPT_KEY, readString);
    if (held !== null) {
      return held;
    }
    const fresh = crypto.randomUUID();
    writeLocal(ATTEMPT_KEY, fresh);
    return fresh;
  }

  /**
   * Fige le panier en commande, puis le VIDE : la commande EXISTE au serveur,
   * même si elle reste à régler. Rend `null` quand il n'y a rien à figer — un
   * panier vide ou un mode de service perdu ne font pas une commande.
   *
   * Le panier est vidé avant le paiement, et c'est le bon ordre : ce qui a été
   * commandé n'est plus « en cours d'achat ». Un paiement abandonné laisse une
   * commande à régler, pas un panier fantôme qu'on repasserait en double.
   */
  /**
   * @param settlement comment le client veut régler, ou `null` = le serveur
   *   décide (au compte si des termes lui ont été accordés, par carte sinon).
   *   Payer comptant reste toujours possible, y compris pour un compte au
   *   mensuel : c'est une facilité, pas une obligation.
   */
  async place(settlement: OrderSettlement | null = null): Promise<PlacedOrder | null> {
    const service = this.order.choice();
    const lines = this.cart.lines();
    if (service === null || lines.length === 0) {
      return null;
    }
    const placed = await this.send(service, lines, settlement);
    if (placed === null) {
      return null;
    }
    const payment = placed.payment ?? null;
    const order: PlacedOrder = {
      id: placed.id,
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
      // Pas d'intention = rien à encaisser au checkout : la commande part au
      // compte de la société, ou son total est nul. C'est le serveur qui en
      // décide, jamais l'écran.
      settlement: payment === null ? 'not_required' : 'due',
    };
    this.intent.set(payment === null ? null : { orderId: placed.id, payment });
    // La tentative est close : la commande suivante en ouvrira une autre. Gardée
    // au-delà, elle ferait rendre CETTE commande au prochain panier.
    clearLocal(ATTEMPT_KEY);
    this.placed.update((all) => [order, ...all]);
    writeLocal(KEY, this.placed());
    this.cart.clear();
    return order;
  }

  /**
   * De quoi régler cette commande-ci : l'intention gardée si c'est la bonne,
   * sinon celle que le serveur veut bien redonner.
   *
   * `null` = elle n'attend aucun règlement en ligne — déjà réglée, portée au
   * compte, ou introuvable. La page appelante n'a pas à distinguer : dans les
   * trois cas il n'y a pas de carte à demander.
   */
  async paymentFor(orderId: string): Promise<OrderPaymentIntent | null> {
    const held = this.intent();
    if (held !== null && held.orderId === orderId) {
      return held.payment;
    }
    if (!this.auth.isAuthenticated()) {
      return null;
    }
    try {
      return await firstValueFrom(
        this.auth
          .accessToken$()
          .pipe(
            switchMap((token) =>
              this.http.get<OrderPaymentIntent>(
                `${AUTH_CONFIG.apiBaseUrl}/orders/${orderId}/payment`,
                { headers: { Authorization: `Bearer ${token}` } },
              ),
            ),
          ),
      );
    } catch {
      // Un refus n'est pas une panne : le serveur dit « cette commande n'attend
      // aucun règlement en ligne » exactement comme il dirait « je ne la
      // connais pas ». Aucun toast — la page mène à la confirmation, qui porte
      // déjà l'état réel de la commande.
      return null;
    }
  }

  /**
   * Le règlement a abouti — Stripe a rendu `succeeded`.
   *
   * ⚠️ **C'est un écho, pas l'autorité.** Le passage en `paid` de NOTRE base est
   * écrit par le webhook Stripe, seul témoin qui ne dépend pas du navigateur du
   * client. Ce que cette méthode change est ce que CET écran a le droit de dire.
   */
  markPaid(orderId: string): void {
    this.intent.set(null);
    this.placed.update((all) =>
      all.map((order) => (order.id === orderId ? { ...order, settlement: 'paid' } : order)),
    );
    writeLocal(KEY, this.placed());
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
    settlement: OrderSettlement | null,
  ): Promise<PlacedOrderResponse | null> {
    if (!this.auth.isAuthenticated()) {
      // Pas un échec : une étape. L'écran envoie se connecter, et le panier
      // survit — il vit en base pour qui a déjà un compte.
      return null;
    }
    const payload = payloadOf(service, lines, this.attemptKey(), settlement);
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
      // 🔴 **Une commande déjà en vol n'est pas une panne.** Le serveur refuse
      // un second appel portant la même clé, et c'est le dispositif qui marche :
      // afficher « la commande n'a pas pu être passée » au client dont la
      // commande est précisément en train de partir serait le pire moment pour
      // l'inquiéter. Le CODE se branche, le message s'affiche.
      if (httpErrorCode(error) === IN_FLIGHT) {
        this.notify.info(httpErrorMessage(error, ''));
        return null;
      }
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
 * 🔴 **`requestedWindow` part désormais — en RETRAIT seulement.**
 *
 * Ce commentaire disait « les créneaux sont une maquette ». C'était vrai des
 * deux acheminements quand il a été écrit ; ça ne l'est plus que d'un. Le
 * retrait lit les heures d'ouverture du point (`pickupSlots`), donc la fenêtre
 * qu'un client y choisit est une VRAIE fenêtre — le dialogue avait déjà le
 * `PickupSlot` sous la main et l'aplatissait en libellé à la frontière du store.
 *
 * La livraison, elle, n'envoie toujours rien : `DELIVERY_SLOTS` dit lui-même
 * n'affirmer rien de vrai, et le bon de commande imprimerait cette heure sur un
 * document opposable. Sa fenêtre légitime est celle du CARNET, que le serveur
 * lit à partir de `deliveryAddressId`.
 *
 * Absente veut dire « aucune tranche demandée », ce qui reste exact.
 */
function payloadOf(
  service: ServiceChoice,
  lines: readonly { product: { sku: string }; quantity: number }[],
  idempotencyKey: string,
  settlement: OrderSettlement | null,
): PlaceOrderPayload {
  const content = {
    // 🔴 **Plus de `companyId` ici, et ce n'est plus au navigateur d'en parler.**
    //
    // Il envoyait `null` — « zéro friction : la commande appartient au client,
    // pas à une société » —, si bien qu'un compte sous mercuriale payait le
    // tarif public jusque sur sa facture. Le champ a quitté le contrat le
    // 2026-09-08 : la société est résolue au SERVEUR, depuis les rattachements
    // du demandeur. Le front n'a plus à choisir, et ne peut plus se tromper.
    //
    // Le règlement, lui, se déclare : `null` = le serveur décide comme avant
    // (au compte si les termes sont accordés, par carte sinon).
    settlement,
    // La clé voyage dans le CORPS et non dans un en-tête : au contrat, un appel
    // sans clé est inexprimable — ni le compilateur ni Zod ne le laissent
    // passer. Un en-tête facultatif n'aurait protégé que les appelants qui y
    // pensent, et c'est le navigateur qu'il fallait protéger.
    idempotencyKey,
    requestedDeliveryDate: service.date,
    note: '',
    lines: lines.map((line) => ({ sku: line.product.sku, quantity: line.quantity })),
    deliveryAddressId: null,
    // 🔴 **La clé est OMISE quand il n'y a pas de tranche choisie**, jamais mise
    // à `null` : le serveur lit l'absence comme « prends le défaut » (celui du
    // carnet, en livraison) et un `null` explicite comme « le client n'en veut
    // aucune ». Un `null` posé par commodité effacerait donc une fenêtre que le
    // client a lui-même déclarée sur son adresse.
    ...(service.window === null ? {} : { requestedWindow: service.window }),
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
