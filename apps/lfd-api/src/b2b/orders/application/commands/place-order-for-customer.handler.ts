import { Clock } from "../../../../platform/time/clock.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import type { Order } from "../../domain/entities/order.js";
import { AccountSettlementNotGrantedError } from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository, type PlacedOrder } from "../../domain/ports/order.repository.js";
import { ShelfWithoutCreditRefusedError } from "../../domain/errors/shelf-circuit-errors.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { paymentUrlFor } from "../../domain/services/payment-link.js";
import { OrderDrafting } from "../services/order-drafting.service.js";
import { accountStanding } from "../services/order-settlement.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "./place-order-for-customer.command.js";
import { REGISTERED_BUYER } from "../../domain/value-objects/order-buyer-kind.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/** L'intention du lien de règlement, créée avant l'écriture : à annuler si elle échoue. */
interface CreatedLink {
  readonly paymentIntentId: string;
}

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
    private readonly payments: PaymentGateway,
    private readonly events: DomainEventPublisher,
    private readonly config: AppConfig,
    private readonly waivers: OrderCutoffWaiverGate,
    private readonly clock: Clock,
    private readonly unitOfWork: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly shelf: ShelfCircuit,
  ) {}

  async execute(command: PlaceOrderForCustomerCommand): Promise<PlaceOrderForCustomerResult> {
    const { payload } = command;
    const { companyId, buyerUserId } = payload;

    // Le mur : l'acheteur désigné doit appartenir à la société. Un 404
    // non-divulguant sinon, comme sur le chemin client — le back-office n'a pas
    // besoin d'un message plus bavard, il a la fiche sous les yeux.
    const role = await this.guard.roleOf(buyerUserId, companyId);
    ensureOrderMember(role, companyId);

    const { order, waiverUsed } = await this.drafting.draft(
      // Le client porté est membre d'une société : un compte, pas un invité (§ 13.7).
      {
        companyId,
        placedByUserId: buyerUserId,
        placedByStaffId: command.staffUserId,
        buyerKind: REGISTERED_BUYER,
      },
      payload,
      // Le staff ne dépense pas le bon d'un client : son contrat n'en nomme aucun (plan des points, C3).
      null,
      // Ni de langue : celle de l'écran du back-office ne dit rien du client (lot A3).
      null,
      // La marque que l'écran envoie — `shelf` pour le « Retrait immédiat »
      // (plan du jour J, §11.1, lot L4) ; absente, fabriquée comme avant.
      payload.supply,
    );

    const intent = await this.settle(order, payload.settlement, companyId);
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
    intent: CreatedLink | null,
  ): Promise<PlacedOrder> {
    try {
      return await this.unitOfWork.run(async () => {
        await this.drafting.holdSupply(order, requestedDeliveryDate);
        const written = await this.orders.place(order);
        await this.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
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
   * Décide le règlement. `account` exige un crédit réellement accordé — sans quoi
   * un écran de back-office suffirait à en inventer un. `link` crée l'intention
   * Stripe, sauf sur un total nul où il n'y a rien à encaisser — et, sur la
   * vitrine, suit le réglage du pro sans crédit (Q7).
   */
  private async settle(
    order: Order,
    settlement: PlaceOrderForCustomerCommand["payload"]["settlement"],
    companyId: string,
  ): Promise<CreatedLink | null> {
    if (settlement === "account") {
      await this.ensureSettlesOnAccount(companyId, order.billedCompanyId);
      order.deferPayment();
      return null;
    }
    if (order.isFromShelf) {
      await this.ensureShelfLinkAllowed(companyId, order.billedCompanyId);
    }
    if (order.totalCents <= 0) {
      // Rien à encaisser : un lien de règlement à 0 € enverrait le client sur une
      // page qui n'a rien à lui demander.
      order.deferPayment();
      return null;
    }
    const intent = await this.payments.createIntent({
      amountCents: order.totalCents,
      currency: CURRENCY,
      companyId,
    });
    order.payByCard(intent.paymentIntentId);
    return { paymentIntentId: intent.paymentIntentId };
  }

  /**
   * **Un pro sans crédit, sur la vitrine** (plan du jour J, §11.3, Q7) : le
   * réglage « Pro sans crédit » refuse, ou l'envoie au lien de paiement — et
   * la commande attend alors dans la file, règlement non clos. Un pro qui a
   * un crédit peut toujours être envoyé au lien : c'est le choix du vendeur.
   *
   * @throws {ShelfWithoutCreditRefusedError} sans crédit, et le réglage refuse.
   */
  private async ensureShelfLinkAllowed(companyId: string, payerId: string | null): Promise<void> {
    const standing = await accountStanding(this.guard, { companyId, payerId });
    if (standing !== "granted" && (await this.shelf.refusesWithoutCredit())) {
      throw new ShelfWithoutCreditRefusedError(companyId);
    }
  }

  /**
   * Le crédit se négocie société par société : il se constate, il ne se
   * suppose pas. Celui du PAYEUR (T44) — la règle est celle du client, écrite
   * une fois dans `accountStanding`.
   */
  private async ensureSettlesOnAccount(companyId: string, payerId: string | null): Promise<void> {
    const standing = await accountStanding(this.guard, { companyId, payerId });
    if (standing !== "granted") {
      throw new AccountSettlementNotGrantedError(standing === "blocked");
    }
  }
}
