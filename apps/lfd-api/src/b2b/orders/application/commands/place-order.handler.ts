import { Clock } from "../../../../platform/time/clock.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";

import {
  IdempotencyKeyReusedError,
  OrderAlreadyInFlightError,
} from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderIdempotencyStore } from "../../domain/ports/order-idempotency.store.js";
import { LoyaltyVoucherQuoteReader } from "../../domain/ports/loyalty-voucher-quote.reader.js";
import { LoyaltyVoucherRedemption } from "../../domain/ports/loyalty-voucher-redemption.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { orderFingerprint } from "../../domain/services/order-fingerprint.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { PublicDeliveryGate } from "../services/public-delivery-gate.js";
import { settleOrder, type CreatedIntent } from "../services/order-settlement.js";
import { PlaceOrderCommand, type PlaceOrderResult } from "./place-order.command.js";

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
    private readonly voucherQuotes: LoyaltyVoucherQuoteReader,
    private readonly vouchers: LoyaltyVoucherRedemption,
    private readonly publicDelivery: PublicDeliveryGate,
    private readonly durable: DurablePublisher,
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
    // Le refus précède la clé, comme sur la route sans compte : il ne dépend
    // d'aucune écriture, et une clé réclamée puis relâchée laisserait une trace.
    await this.publicDelivery.ensureOpen(
      payload.fulfillmentMethod,
      command.companyId,
      command.subject,
    );
    const key = payload.idempotencyKey;
    const claim = await this.keys.claim(
      command.actorUserId,
      key,
      orderFingerprint(payload, command.companyId),
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
    const { payload, companyId } = command;

    // 🔴 **Ce contrôle a changé de rôle le 2026-09-08, et son ancien commentaire
    // mentait sur sa raison d'être.**
    //
    // Il disait « mur : rattachée à une entreprise ⇒ il faut en être membre ».
    // C'était vrai quand la société arrivait du CORPS de la requête : n'importe
    // qui pouvait en nommer une, et ce contrôle était le seul à s'y opposer.
    //
    // Elle vient maintenant du contexte, résolu par le guard **depuis les
    // rattachements** (`resolve-company.ts`). Sur le chemin HTTP, l'appartenance
    // est donc acquise avant d'arriver ici : ce contrôle ne peut plus refuser
    // quoi que ce soit, et le mur qu'il gardait est devenu inexprimable.
    //
    // Il RESTE, et pas par prudence vague : la commande s'exécute aussi hors
    // requête — le semis passe la société explicitement, et rien ne l'a
    // confrontée aux rattachements. C'est ce chemin-là qu'il protège désormais,
    // et lui seul. Le retirer rendrait possible une commande semée sous une
    // maison dont l'acheteur n'est pas.
    if (companyId !== null) {
      const role = await this.guard.roleOf(command.actorUserId, companyId);
      ensureOrderMember(role, companyId);
    }

    // Le bon se LIT ici, sans rien engager : sa valeur entre dans le total, donc
    // dans l'intention Stripe. C'est la réservation, plus bas, qui tranche une
    // course (plan des points, C3).
    const voucher =
      payload.voucherId === undefined
        ? null
        : await this.voucherQuotes.quote(payload.voucherId, command.actorUserId, this.clock.now());
    const { order, waiverUsed } = await this.drafting.draft(
      { companyId, placedByUserId: command.actorUserId, placedByStaffId: null },
      payload,
      voucher,
    );

    const intent = await settleOrder(
      { guard: this.guard, payments: this.payments },
      order,
      companyId,
      payload.settlement,
    );
    const placed = await this.persist(command, order, intent);

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
   * **La commande, sa clé, et son bon, ensemble.**
   *
   * `transactionalPrisma` fait rejoindre les dépôts à la transaction ouverte
   * ici : il n'existe aucun instant où la commande est écrite et la clé ne
   * l'est pas — le seul état que ce dispositif ne survivrait pas. Le bon y
   * entre aussi (plan des points, C3) : réservé AVANT l'écriture de la
   * commande, sous le verrou de son titulaire. Une course perdue lève ici,
   * avant `orders.place` : rien n'est écrit, et la clé est rendue.
   *
   * Une commande sans règlement (`not_required` — un total que le bon couvre
   * entier) est définitive dès sa passation : son reliquat s'émet dans la même
   * transaction (C5). Les autres attendent le rattrapage de nuit.
   *
   * 🔴 Si la transaction échoue, l'intention Stripe déjà créée est annulée
   * (§11 bis, mineurs) : jamais confirmée, elle ne serait jamais débitée, mais
   * un bon disputé par deux onglets en rendrait l'orpheline courante.
   * `cancelIntent` ne lève jamais.
   */
  private async persist(
    command: PlaceOrderCommand,
    order: Order,
    intent: CreatedIntent | null,
  ): Promise<PlacedOrder> {
    const { actorUserId, payload } = command;
    const voucherId = payload.voucherId ?? null;
    try {
      return await this.unitOfWork.run(async () => {
        if (voucherId !== null) {
          await this.vouchers.reserve(voucherId, actorUserId, this.clock.now());
        }
        const written = await this.orders.place(order);
        await this.keys.resolve(actorUserId, payload.idempotencyKey, written.id);
        // La livraison situe l'adresse : un fait durable, écrit avec la commande (CA0).
        await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
        if (voucherId !== null && intent === null) {
          await this.vouchers.settleRemainder(
            {
              voucherId,
              appliedCents: order.voucherDiscountCents,
              order: { id: written.id, number: written.orderNumber },
            },
            this.clock.now(),
          );
        }
        return written;
      });
    } catch (error) {
      if (intent !== null) {
        await this.payments.cancelIntent(intent.paymentIntentId);
      }
      throw error;
    }
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
}
