import { Clock } from "../../../../platform/time/clock.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import type { OrderSettlement } from "@lfd/contracts";

import {
  IdempotencyKeyReusedError,
  OrderAlreadyInFlightError,
  TermsNotGrantedError,
} from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderIdempotencyStore } from "../../domain/ports/order-idempotency.store.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { PlaceOrderCommand, type PlaceOrderResult } from "./place-order.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/**
 * Passe une commande — **zéro friction**, le client pour lui-même.
 *
 * Le handler **orchestre** ; la composition du panier vit dans {@link OrderDrafting}
 * (prix ré-résolus, acheminement, ajustements) et le **calcul monétaire** dans
 * l'agrégat `Order`. Ne restent ici que les deux décisions propres à ce chemin :
 * - le mur **membre**, SEULEMENT si une entreprise est visée (sinon personnelle) ;
 * - le règlement : `payByCard` si une carte est requise et le total > 0, sinon
 *   `deferPayment`.
 *
 * Pour une carte, l'intention Stripe est créée AVANT la persistance, dimensionnée
 * sur `order.totalCents` : une commande `pending` porte toujours son intent.
 */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlaceOrderResult> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
    private readonly waivers: OrderCutoffWaiverGate,
    private readonly clock: Clock,
    private readonly keys: OrderIdempotencyStore,
    private readonly reader: OrderReader,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  /**
   * **La clé d'abord, tout le reste ensuite.**
   *
   * Elle se réclame avant le mur de membre et avant la composition, et l'ordre
   * n'est pas négociable : l'intention Stripe est créée AVANT que la commande
   * soit persistée, donc un garde posé plus bas laisserait déjà passer une
   * seconde intention pour un double clic.
   *
   * Ce qui suit la réclamation est enveloppé : tout échec levé **avant**
   * l'écriture rend la clé, parce que le client doit pouvoir corriger et
   * renvoyer. Le critère est la POSITION, jamais la nature de l'erreur —
   * `DuplicateResourceError` est une erreur métier levée par la persistance,
   * donc de l'autre côté du point de non-retour.
   */
  async execute(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const { payload } = command;
    const key = payload.idempotencyKey;
    const claim = await this.keys.claim(
      command.actorUserId,
      key,
      orderFingerprint(payload),
      this.clock.now(),
    );
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
      return await this.placeOnce(command);
    } catch (error) {
      // Rendue seulement si RIEN n'a été écrit. `placeOnce` ne laisse remonter
      // d'erreur qu'avant `orders.place` : à partir de là, la transaction a
      // tranché ce qui existe, et une clé rendue en ferait passer une seconde.
      await this.keys.release(command.actorUserId, key);
      throw error;
    }
  }

  /** La passation elle-même. Tout ce qui échoue ici l'a fait AVANT l'écriture. */
  private async placeOnce(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const { payload } = command;
    const { companyId } = payload;

    // Mur : rattachée à une entreprise ⇒ il faut en être membre. Personnelle ⇒
    // seul le client connecté la possède, rien à vérifier.
    if (companyId !== null) {
      const role = await this.guard.roleOf(command.actorUserId, companyId);
      ensureOrderMember(role, companyId);
    }

    const { order, waiverUsed } = await this.drafting.draft(
      { companyId, placedByUserId: command.actorUserId, placedByStaffId: null },
      payload,
    );

    const intent = await this.settle(order, companyId, payload.settlement);
    // LA COMMANDE ET SA CLÉ, ENSEMBLE. `transactionalPrisma` fait rejoindre les
    // deux dépôts à la transaction ouverte ici : il n'existe donc aucun instant
    // où la commande est écrite et la clé ne l'est pas — le seul état que ce
    // dispositif ne survivrait pas.
    const placed = await this.unitOfWork.run(async () => {
      const written = await this.orders.place(order);
      await this.keys.resolve(command.actorUserId, payload.idempotencyKey, written.id);
      return written;
    });

    // La dérogation se consomme APRÈS la persistance : la brûler avant aurait
    // laissé le client sans autorisation pour une commande qui n'existe pas.
    await this.spendWaiver(waiverUsed, placed.id);

    // Fait de domaine, publié APRÈS persistance (on ne journalise pas une commande
    // qui n'a pas pris). Le journal croissance écoute ; l'échec d'un abonné ne
    // remonte pas ici (le recorder est best-effort).
    this.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        command.actorUserId,
        companyId,
        order.totalCents,
      ),
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
   * **Le rejeu** : la même commande, sans rien réécrire.
   *
   * La réponse est RE-DÉRIVÉE plutôt que relue d'une colonne. Le `clientSecret`
   * n'est pas chez nous et n'a rien à y faire — c'est déjà la règle de
   * `GetOrderPaymentHandler`, qui le redemande au prestataire plutôt que de le
   * laisser vieillir en base. Un aller-retour de plus, sur un chemin rare.
   *
   * Ni la dérogation ni l'événement de domaine ne repartent : la commande a
   * déjà consommé l'une et publié l'autre. Un rejeu ne recommence rien.
   */
  private async replay(orderId: string): Promise<PlaceOrderResult> {
    const found = await this.reader.findById(orderId);
    if (found === null) {
      // Une clé résolue vers une commande introuvable est une incohérence de
      // base, pas un cas métier : mieux vaut le silence d'un rejeu sans
      // règlement qu'une réponse inventée.
      throw new OrderAlreadyInFlightError();
    }
    const { view, stripePaymentIntentId } = found;
    if (view.paymentStatus !== "pending" || stripePaymentIntentId === null) {
      return { id: view.id, orderNumber: view.orderNumber };
    }
    const intent = await this.payments.retrieveIntent(stripePaymentIntentId);
    return {
      id: view.id,
      orderNumber: view.orderNumber,
      payment: {
        clientSecret: intent.clientSecret,
        publishableKey: this.payments.publishableKey(),
        amountCents: view.totalCents,
      },
    };
  }

  /**
   * Marque l'autorisation comme dépensée, s'il y en a eu une.
   *
   * L'échec n'est **pas** absorbé : une dérogation qui reste ouverte après avoir
   * servi laisserait passer une seconde commande tardive sur une seule décision.
   * Mieux vaut une commande qui échoue bruyamment qu'une exception qui se
   * dédouble en silence.
   */
  private async spendWaiver(waiverId: string | null, orderId: string): Promise<void> {
    if (waiverId === null) {
      return;
    }
    await this.waivers.consume(waiverId, orderId, this.clock.now());
  }

  /**
   * Décide le règlement de l'agrégat et crée l'intention Stripe si une carte est
   * requise (total > 0). Renvoie l'intention (pour le `clientSecret`) ou `null`
   * (différé / gratuit). L'intention est dimensionnée sur `order.totalCents`.
   */
  private async settle(
    order: Order,
    companyId: string | null,
    settlement: OrderSettlement | null,
  ): Promise<{ clientSecret: string } | null> {
    const requiresCard = (await this.requiresCard(companyId, settlement)) && order.totalCents > 0;
    if (!requiresCard) {
      order.deferPayment();
      return null;
    }
    const intent = await this.payments.createIntent({
      amountCents: order.totalCents,
      currency: CURRENCY,
      companyId,
    });
    order.payByCard(intent.paymentIntentId);
    return { clientSecret: intent.clientSecret };
  }

  /**
   * **La carte est-elle requise ?** — le choix du client d'abord, la règle ensuite.
   *
   * @throws {TermsNotGrantedError} le compte a été demandé sans crédit accordé.
   */
  private async requiresCard(
    companyId: string | null,
    settlement: OrderSettlement | null,
  ): Promise<boolean> {
    const onAccount = await this.maySettleOnAccount(companyId);
    // **Payer comptant est toujours possible**, y compris pour une société à qui
    // le mensuel a été accordé. Le crédit est une facilité, pas une obligation :
    // un client qui veut régler tout de suite avec SON tarif doit pouvoir le
    // faire, et c'est exactement ce que la boutique lui demandera.
    if (settlement === "card") {
      return true;
    }
    // Le compte se REFUSE plutôt que de se rabattre en silence sur la carte :
    // prélever quelqu'un qui croyait commander au compte est le genre de
    // surprise qui se règle au téléphone.
    if (settlement === "account") {
      if (!onAccount) {
        throw new TermsNotGrantedError(companyId);
      }
      return false;
    }
    // Rien de demandé : la décision d'avant, mot pour mot. C'est le chemin du
    // back-office, qui n'a personne devant l'écran pour choisir.
    return !onAccount;
  }

  /**
   * Une société **active** à qui un crédit a été accordé peut régler au compte.
   *
   * Sans entreprise, ou entreprise non activée : jamais. Le crédit se négocie
   * avec une société cliente, pas avec un panier.
   */
  private async maySettleOnAccount(companyId: string | null): Promise<boolean> {
    if (companyId === null) {
      return false;
    }
    if ((await this.guard.companyStatusOf(companyId)) !== "active") {
      return false;
    }
    return this.guard.settlesOnAccount(companyId);
  }
}
