import { Clock } from "../../../../platform/time/clock.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import {
  CardPayments,
  type PreparedCardPayment,
} from "../../../../card-payment/channels/requests/index.js";
import {
  ORDER_CARD_SUBJECT_TYPE,
  orderCardSubject,
  orderCardTag,
} from "../services/order-card-subject.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { paymentUrlFor } from "../../domain/services/payment-link.js";
import { isCounterEntry } from "../../domain/services/order-supply-rules.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { OrderIntake } from "../services/order-intake.service.js";
import { prepareStaffOrder } from "../services/staff-order-preparation.js";
import { staffSettlementRefusal } from "../services/staff-settlement-refusal.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "./place-order-for-customer.command.js";

/**
 * Passe une commande **au nom d'un client**, depuis le back-office.
 *
 * Le panier se compose exactement comme celui du client ({@link OrderDrafting}) —
 * mêmes prix ré-résolus, même remise de retrait, même zone déduite du code
 * postal. Deux choses seulement diffèrent, et ce sont les deux raisons d'être de
 * ce handler :
 *
 * 1. **Le mur porte sur l'acheteur, pas sur l'acteur.** Un commercial n'est
 *    membre d'aucune société cliente : vérifier SON appartenance n'aurait aucun
 *    sens. C'est `buyerUserId` — la personne au nom de qui la commande est
 *    portée — qui doit être membre. Il vient du corps de la requête, donc il se
 *    vérifie ; le droit d'être là, lui, a déjà été tranché par la porte staff.
 *
 * 2. **Aucune carte n'est saisie ici.** Le règlement au compte est refusé si la
 *    société n'a pas de crédit ; sinon on crée une intention et on rend un
 *    **lien** que le client suivra lui-même. Un numéro de carte dicté au
 *    téléphone et tapé par un commercial est précisément ce qu'on n'autorise pas.
 */
@CommandHandler(PlaceOrderForCustomerCommand)
export class PlaceOrderForCustomerHandler implements ICommandHandler<
  PlaceOrderForCustomerCommand,
  PlaceOrderForCustomerResult
> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly drafting: OrderDrafting,
    private readonly orders: OrderRepository,
    private readonly payments: CardPayments,
    private readonly events: DomainEventPublisher,
    private readonly config: AppConfig,
    private readonly waivers: OrderCutoffWaiverGate,
    private readonly clock: Clock,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly shelf: ShelfCircuit,
    private readonly intake: OrderIntake,
  ) {}

  async execute(command: PlaceOrderForCustomerCommand): Promise<PlaceOrderForCustomerResult> {
    const { payload } = command;
    const { companyId, buyerUserId } = payload;

    // La préparation que l'estimation partage (lot P2) : le mur sur
    // l'acheteur, le comptoir, la porte de la boutique, puis la composition.
    const { order, waiverUsed } = await prepareStaffOrder(
      { guard: this.guard, intake: this.intake, drafting: this.drafting },
      command.staffUserId,
      payload,
      "checkout",
    );
    // Le total que l'estimation a montré, avant le règlement (T2) : un refus ici
    // précède celui du compte sans crédit et ne crée aucun lien.
    ensureTotalSeen(order.totalCents, payload.expectedTotalCents);

    const intent = await this.settle(
      order,
      payload.settlement,
      companyId,
      isCounterEntry(payload.entryOrigin, payload.entryShortcut),
    );
    const placed = await this.persist(order, payload.requestedDeliveryDate, intent);

    // La dérogation se consomme APRÈS la persistance, et son échec ne s'absorbe
    // pas : restée ouverte, elle laisserait passer une seconde commande tardive
    // sur une seule décision.
    if (waiverUsed !== null) {
      await this.waivers.consume(waiverUsed, placed.id, this.clock.now());
    }

    // Le fait de domaine porte l'ACHETEUR, pas le commercial : c'est bien ce
    // client-là qui vient de commander, et le journal croissance compte des
    // clients. Qui a saisi est sur la commande, où c'est une trace, pas un signal.
    this.events.publish(
      new OrderPlacedEvent(placed.id, placed.orderNumber, buyerUserId, companyId, order.totalCents),
    );

    const paymentUrl =
      intent === null ? undefined : paymentUrlFor(this.config.clientBaseUrl(), placed.id);
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      settlement: payload.settlement,
      totalCents: order.totalCents,
      ...(paymentUrl === null || paymentUrl === undefined ? {} : { paymentUrl }),
    };
  }

  /**
   * La commande et le fait qui fait situer son adresse (CA0), ensemble. La
   * journée — ou, sur stock, la vitrine (plan du jour J, §12) — d'abord, sous
   * son verrou : l'arrêt du plan ou une passation concurrente ne passent plus
   * entre la composition et l'écriture (lot O3, S5). Un refus annule
   * l'intention du lien, qui ne servirait plus à rien.
   */
  private async persist(
    order: Order,
    requestedDeliveryDate: string | null,
    intent: PreparedCardPayment | null,
  ): Promise<PlacedOrder> {
    try {
      return await this.unitOfWork.run(async () => {
        await this.drafting.holdSupply(order, requestedDeliveryDate);
        const written = await this.orders.place(order);
        if (intent !== null) {
          await this.payments.attach(orderCardSubject(written.id), intent, "first");
        }
        await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
        return written;
      });
    } catch (error) {
      if (intent !== null) {
        await this.payments.release(intent);
      }
      throw error;
    }
  }

  /**
   * Décide le règlement. `account` exige un crédit réellement accordé — sans quoi
   * un écran de back-office suffirait à en inventer un. `link` crée l'intention
   * Stripe, sauf sur un total nul où il n'y a rien à encaisser — et, sur la
   * vitrine, suit le réglage du pro sans crédit (Q7).
   */
  private async settle(
    order: Order,
    settlement: PlaceOrderForCustomerCommand["payload"]["settlement"],
    companyId: string,
    atCounter: boolean,
  ): Promise<PreparedCardPayment | null> {
    // Le prédicat que l'estimation partage (lot P2) : ici, il refuse.
    const refusal = await staffSettlementRefusal(
      { guard: this.guard, shelf: this.shelf },
      order,
      settlement,
      companyId,
      atCounter,
    );
    if (refusal !== null) {
      throw refusal;
    }
    if (settlement === "account" || order.totalCents <= 0) {
      // Au compte, ou rien à encaisser : un lien de règlement à 0 € enverrait
      // le client sur une page qui n'a rien à lui demander.
      order.deferPayment();
      return null;
    }
    const { prepared } = await this.payments.prepare(
      ORDER_CARD_SUBJECT_TYPE,
      order.totalCents,
      orderCardTag(companyId),
    );
    order.payByCard(prepared.providerRef);
    return prepared;
  }
}
