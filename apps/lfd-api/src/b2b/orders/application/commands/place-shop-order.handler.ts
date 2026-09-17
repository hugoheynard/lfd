import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import {
  IdempotencyKeyReusedError,
  OrderAlreadyInFlightError,
} from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { GuestBuyerRegistrar } from "../../domain/ports/guest-buyer.registrar.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ShopOrderIdempotencyStore } from "../../domain/ports/shop-order-idempotency.store.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import { GuestIdentity } from "../../domain/value-objects/guest-identity.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { PlaceShopOrderCommand, type PlaceShopOrderResult } from "./place-shop-order.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/**
 * **Commander sans compte** — plan
 * `documentation/b2b/plan-commande-sans-compte.md`, §5 et lot C.
 *
 * ## Ce qu'il partage avec la passation connectée, et ce qu'il ne partage pas
 *
 * La composition du panier est **la même** : {@link OrderDrafting} ré-résout les
 * prix au catalogue, déduit la zone du code postal, applique la remise du point
 * de retrait, et l'agrégat calcule ses montants. Un second chemin de composition
 * aurait fini par appliquer une autre remise — sur celui des deux qu'on teste le
 * moins.
 *
 * Trois choses diffèrent, et ce sont exactement les trois que le plan nomme :
 *
 * 1. **le porteur n'existe pas encore.** On l'inscrit : un `User` sans identité
 *    de connexion, ce qui fait marcher sans une ligne de changement le courriel
 *    de confirmation, le QR de retrait et la fiche de commande (lot D) ;
 * 2. **le règlement n'est pas une question.** C'est la carte, toujours : le
 *    crédit se négocie avec une société cliente, et il n'y en a pas ;
 * 3. **le rejeu ne rend aucun secret de paiement.** Cf. {@link replay}.
 *
 * ## Ce qu'il ne fait pas, structurellement
 *
 * Ni mur de membre, ni dérogation d'heure limite : les deux supposent une
 * société, et il n'y en a pas. Ce n'est pas un contrôle omis — c'est un contrôle
 * qui n'a rien à mordre, et `OrderDrafting` le sait déjà (il ne consulte le
 * registre des dérogations que si `companyId` n'est pas nul, vérifié le
 * 2026-09-17).
 */
@CommandHandler(PlaceShopOrderCommand)
export class PlaceShopOrderHandler implements ICommandHandler<
  PlaceShopOrderCommand,
  PlaceShopOrderResult
> {
  constructor(
    private readonly buyers: GuestBuyerRegistrar,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly keys: ShopOrderIdempotencyStore,
    private readonly reader: OrderReader,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * **La clé d'abord, tout le reste ensuite** — comme sur le chemin connecté, et
   * l'ordre n'est pas négociable : l'intention Stripe est créée AVANT que la
   * commande soit persistée, donc un garde posé plus bas laisserait déjà passer
   * une seconde intention pour un double clic.
   *
   * Ce qui suit la réclamation est enveloppé : tout échec levé **avant**
   * l'écriture rend la clé, parce que le client doit pouvoir corriger et
   * renvoyer. Le critère est la POSITION, jamais la nature de l'erreur.
   */
  async execute(command: PlaceShopOrderCommand): Promise<PlaceShopOrderResult> {
    const { payload } = command;
    const key = payload.idempotencyKey;
    // `null` de société : une commande publique n'en a pas, et l'empreinte doit
    // le dire comme l'autre surface le dit — deux paniers identiques passés pour
    // deux maisons différentes sont deux commandes.
    const claim = await this.keys.claim(key, orderFingerprint(payload, null), this.clock.now());
    if (claim.kind === "mismatch") {
      throw new IdempotencyKeyReusedError();
    }
    if (claim.kind === "in_flight") {
      throw new OrderAlreadyInFlightError();
    }
    if (claim.kind === "replayed") {
      return this.replay(claim.orderId);
    }
    try {
      return await this.placeOnce(payload);
    } catch (error) {
      await this.keys.release(key);
      throw error;
    }
  }

  /** La passation elle-même. Tout ce qui échoue ici l'a fait AVANT l'écriture. */
  private async placeOnce(
    payload: PlaceShopOrderCommand["payload"],
  ): Promise<PlaceShopOrderResult> {
    // L'identité passe par le DOMAINE avant d'atteindre la base : le contrôleur
    // n'a validé qu'une forme, et c'est le value object qui refuse une adresse
    // qui n'en est pas une. Même goulot que l'ouverture d'accès du commercial.
    const buyer = GuestIdentity.declare(payload.buyer);
    // 🔴 **Inscrit AVANT la composition**, et ce n'est pas gratuit : un refus
    // levé plus bas — SKU inconnu, secteur non desservi, heure limite dépassée —
    // laisse derrière lui une personne sans commande.
    //
    // Assumé, faute de mieux : l'agrégat porte son `placedByUserId` dès sa
    // construction, donc l'inscrire plus tard demanderait de composer la
    // commande autour d'un porteur qui n'existe pas. Et une ligne orpheline ne
    // coûte rien ici — elle n'ouvre aucun accès (aucune identité de connexion),
    // elle ne reçoit aucun courriel (rien n'est publié), et D2 assume déjà que
    // deux visiteurs d'une même adresse font deux lignes.
    const buyerUserId = await this.buyers.register(buyer.forRegistration());
    // `waiverUsed` n'est pas lu : sans société, `OrderDrafting` ne consulte
    // jamais le registre des dérogations et rend donc toujours `null` (vérifié
    // le 2026-09-17). Le nommer pour l'ignorer laisserait croire qu'on a choisi
    // de ne pas le consommer.
    const { order } = await this.drafting.draft(
      { companyId: null, placedByUserId: buyerUserId, placedByStaffId: null },
      payload,
    );

    const intent = await this.settle(order);
    // LA COMMANDE ET SA CLÉ, ENSEMBLE. Il n'existe aucun instant où la commande
    // est écrite et la clé ne l'est pas — le seul état que ce dispositif ne
    // survivrait pas : ni rendable (la commande existe), ni reprenable (on en
    // passerait une seconde).
    const placed = await this.unitOfWork.run(async () => {
      const written = await this.orders.place(order);
      await this.keys.resolve(payload.idempotencyKey, written.id);
      return written;
    });

    // Fait de domaine, publié APRÈS persistance. C'est lui qui déclenche le
    // courriel de confirmation et son QR — le porteur inscrit plus haut a une
    // adresse, donc l'envoi part vraiment (plan §5).
    this.events.publish(
      new OrderPlacedEvent(placed.id, placed.orderNumber, buyerUserId, null, order.totalCents),
    );

    if (intent === null) {
      return { id: placed.id, orderNumber: placed.orderNumber };
    }
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      payment: {
        clientSecret: intent.clientSecret,
        publishableKey: this.payments.publishableKey(),
        amountCents: order.totalCents,
      },
    };
  }

  /**
   * **Le rejeu : la même commande, et RIEN de plus.**
   *
   * 🔴 Aucune intention n'est redemandée au prestataire, là où
   * `PlaceOrderHandler.replay()` en redemande une. La différence est le cœur du
   * dispositif public : `retrieveIntent` rend un `clientSecret` **vivant**, et
   * cette surface-ci n'a pas de jeton pour décider qui a le droit de l'obtenir.
   * Détenir une clé — que le client choisit, donc qu'on peut tenter — rendrait
   * sinon une commande ET de quoi payer dessus (plan §5, objection B4).
   *
   * Conséquence assumée, et c'est D4 : un règlement interrompu perd le
   * **paiement**, pas la **commande**. Elle existe, elle se règle au comptoir ou
   * sur relance.
   */
  private async replay(orderId: string): Promise<PlaceShopOrderResult> {
    const found = await this.reader.findById(orderId);
    if (found === null) {
      // Une clé résolue vers une commande introuvable est une incohérence de
      // base, pas un cas métier : mieux vaut le silence d'un rejeu sans
      // règlement qu'une réponse inventée.
      throw new OrderAlreadyInFlightError();
    }
    return { id: found.view.id, orderNumber: found.view.orderNumber };
  }

  /**
   * **La carte, toujours** — dès qu'il y a quelque chose à encaisser.
   *
   * Pas de `settlement` à lire : le contrat public n'en porte pas. Le compte se
   * négocie avec une société cliente, et un panier n'en est pas une ; le lui
   * offrir depuis une surface anonyme reviendrait à accorder un crédit à
   * quiconque tape une adresse.
   *
   * Un total nul ne crée aucune intention : Stripe refuserait un montant de
   * zéro, et il n'y a rien à encaisser.
   */
  private async settle(order: Order): Promise<{ clientSecret: string } | null> {
    if (order.totalCents <= 0) {
      order.deferPayment();
      return null;
    }
    const intent = await this.payments.createIntent({
      amountCents: order.totalCents,
      currency: CURRENCY,
      companyId: null,
    });
    order.payByCard(intent.paymentIntentId);
    return { clientSecret: intent.clientSecret };
  }
}
