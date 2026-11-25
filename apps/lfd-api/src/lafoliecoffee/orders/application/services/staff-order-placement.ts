import { orderPretaxCents } from "@lfd/money";

import type { AppConfig } from "../../../../platform/config/app-config.js";
import type { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { IdGenerator } from "../../../../platform/id/id-generator.js";
import type { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import type { Clock } from "../../../../platform/time/clock.js";
import { CommerceOrderPlacedFact } from "../../../../delivery/channels/commerce/index.js";
import type {
  CardPayments,
  PreparedCardPayment,
} from "../../../../payment/channels/requests/index.js";
import type { ExceededItemLimit } from "../../../order-cutoffs/index.js";
import type { Order } from "../../domain/entities/order.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import type { ItemLimitOverrideRecorder } from "../../domain/ports/item-limit-override.recorder.js";
import type { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import type { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import type { OrderRepository, PlacedOrder } from "../../domain/ports/order.repository.js";
import type { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import {
  itemLimitOverridesOf,
  justifyItemLimitOverrides,
} from "../../domain/services/item-limit-overrides.js";
import { isCounterEntry } from "../../domain/services/order-supply-rules.js";
import { paymentUrlFor } from "../../domain/services/payment-link.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import type { PlaceOrderForCustomerResult } from "../commands/place-order-for-customer.command.js";
import { commitOrderBudget } from "./order-budget-commitment.js";
import { ORDER_CARD_SUBJECT_TYPE, orderCardSubject, orderCardTag } from "./order-card-subject.js";
import type { DraftPolicy, OrderDrafting } from "./order-drafting.service.js";
import { publishOrderOffered } from "./order-offering.js";
import type { ShelfCircuit } from "./shelf-circuit.service.js";
import { prepareStaffOrder } from "./staff-order-preparation.js";
import { staffSettlementRefusal } from "./staff-settlement-refusal.js";
import type { AdminPlaceOrderPayload } from "@lfd/contracts";

/** Ce que la passation de l'équipe lit et écrit. */
export interface StaffOrderPlacementPorts {
  readonly guard: OrderGuardReader;
  readonly drafting: OrderDrafting;
  readonly orders: OrderRepository;
  readonly payments: CardPayments;
  readonly events: DomainEventPublisher;
  readonly config: AppConfig;
  readonly waivers: OrderCutoffWaiverGate;
  readonly clock: Clock;
  readonly unitOfWork: UnitOfWork;
  readonly durable: DurablePublisher;
  readonly shelf: ShelfCircuit;
  readonly commitments: PayerCommitmentRequirements;
  readonly overrides: ItemLimitOverrideRecorder;
  readonly ids: IdGenerator;
}

/** Une saisie de l'équipe : qui saisit, ce qu'il saisit, et son droit de passer une limite. */
export interface StaffPlacementRequest {
  readonly staffUserId: string;
  readonly payload: AdminPlaceOrderPayload;
  readonly exceedItemLimits: boolean;
}

/**
 * Ce qu'un cas d'usage écrit avec la commande, dans SA transaction : au début,
 * avant la journée tenue ; puis la commande écrite, avant que la clé
 * d'intention se scelle. Un refus de l'un annule la commande.
 */
export interface StaffPlacementBinding {
  readonly beforePlace: () => Promise<void>;
  readonly afterPlace: (placed: PlacedOrder) => Promise<void>;
}

/** La saisie ordinaire : rien d'autre ne s'écrit avec la commande. */
export const ORDINARY_STAFF_PLACEMENT: StaffPlacementBinding = {
  beforePlace: () => Promise.resolve(),
  afterPlace: () => Promise.resolve(),
};

/** Ce que la commande doit à son heure limite, à solder dans sa transaction. */
interface DeadlineDebts {
  readonly waiverUsed: string | null;
  readonly exceeded: readonly ExceededItemLimit[];
  /** Le motif des dépassements, `null` quand rien n'est dépassé. */
  readonly overrideReason: string | null;
}

/**
 * **La passation par l'équipe, une fois l'intention réclamée** — partagée par
 * la saisie ordinaire (`PlaceOrderForCustomerHandler`) et la transformation
 * d'un reliquat (`ConvertBackorderHandler`), qui ne diffèrent que par leur
 * politique de composition et ce qu'elles écrivent avec la commande. Une
 * seconde copie aurait fini par oublier la dérogation, le règlement ou le
 * total vu, sur le chemin qu'on teste le moins.
 *
 * Dans l'ordre : la composition ({@link prepareStaffOrder}), le motif d'une
 * limite passée, l'engagement budgétaire, le total vu, le règlement (le lien
 * part au prestataire HORS transaction), puis la transaction — la journée
 * tenue, la commande, la dérogation consommée, les limites consignées, la
 * carte rattachée, les faits, la clé scellée — et le fait de domaine.
 */
export class StaffOrderPlacement {
  constructor(private readonly ports: StaffOrderPlacementPorts) {}

  async place(
    request: StaffPlacementRequest,
    policy: DraftPolicy,
    binding: StaffPlacementBinding,
    seal: (result: PlaceOrderForCustomerResult) => Promise<void>,
  ): Promise<PlaceOrderForCustomerResult> {
    const { payload } = request;
    const { order, waiverUsed, exceeded } = await prepareStaffOrder(
      { guard: this.ports.guard, drafting: this.ports.drafting },
      request.staffUserId,
      payload,
      "checkout",
      request.exceedItemLimits,
      policy,
    );
    // Le motif d'une limite de produit passée, avant tout règlement : un
    // refus ici ne crée aucun lien et rend la clé d'intention.
    const overrideReason = justifyItemLimitOverrides(
      exceeded,
      payload.itemLimitOverrideReason,
      order.amounts().lines,
    );
    // L'engagement budgétaire d'un payeur public (E2′) : l'estimation ne le
    // juge pas, la passation si — avant le règlement et le lien.
    await commitOrderBudget(order, payload.budgetCommitment, this.ports.commitments);
    // Le total que l'estimation a montré, avant le règlement (T2) : un refus ici
    // précède celui du compte sans crédit et ne crée aucun lien.
    ensureTotalSeen(order.totalCents, payload.expectedTotalCents);
    const intent = await this.settle(order, payload);
    const { placed, result } = await this.persist(
      order,
      request,
      intent,
      { waiverUsed, exceeded, overrideReason },
      { binding, seal },
    );
    // Le fait de domaine porte l'ACHETEUR, pas le commercial : c'est bien ce
    // client-là qui vient de commander, et le journal croissance compte des
    // clients. Qui a saisi est sur la commande, où c'est une trace, pas un signal.
    this.ports.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        payload.buyerUserId,
        payload.companyId,
        order.totalCents,
        orderPretaxCents(order.amounts()),
        order.clientele,
      ),
    );
    return result;
  }

  /** La réponse de la passation — celle que le rejeu rendra à l'identique. */
  private resultOf(
    placed: PlacedOrder,
    order: Order,
    payload: AdminPlaceOrderPayload,
    hasIntent: boolean,
  ): PlaceOrderForCustomerResult {
    const paymentUrl = hasIntent
      ? paymentUrlFor(this.ports.config.clientBaseUrl(), placed.id)
      : undefined;
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
   * l'intention du lien, qui ne servirait plus à rien. La clé d'intention se
   * scelle dans la même transaction : une commande écrite a toujours sa clé
   * résolue.
   */
  private async persist(
    order: Order,
    request: StaffPlacementRequest,
    intent: PreparedCardPayment | null,
    debts: DeadlineDebts,
    {
      binding,
      seal,
    }: {
      readonly binding: StaffPlacementBinding;
      readonly seal: (result: PlaceOrderForCustomerResult) => Promise<void>;
    },
  ): Promise<{ readonly placed: PlacedOrder; readonly result: PlaceOrderForCustomerResult }> {
    const { payload } = request;
    const { ports } = this;
    try {
      return await ports.unitOfWork.run(async () => {
        await binding.beforePlace();
        await ports.drafting.holdSupply(order, payload.requestedDeliveryDate);
        const written = await ports.orders.place(order);
        // La dérogation se dépense avec la commande : une course perdue
        // annule l'une et l'autre, et la clé d'intention est rendue.
        if (debts.waiverUsed !== null) {
          await ports.waivers.consume(debts.waiverUsed, written.id, ports.clock.now());
        }
        await this.recordOverrides(written.id, request, debts);
        if (intent !== null) {
          await ports.payments.attach(orderCardSubject(written.id), intent, "first");
        }
        await ports.durable.publish(new CommerceOrderPlacedFact(written.id).durableFact());
        // Le témoin d'une commande offerte : dans la même transaction que la commande.
        await publishOrderOffered(ports.durable, order, written, {
          buyerUserId: payload.buyerUserId,
          staffUserId: request.staffUserId,
        });
        await binding.afterPlace(written);
        const result = this.resultOf(written, order, payload, intent !== null);
        await seal(result);
        return { placed: written, result };
      });
    } catch (error) {
      if (intent !== null) {
        await ports.payments.release(intent);
      }
      throw error;
    }
  }

  /**
   * Les limites de produit passées, consignées avec la commande : une ligne
   * par SKU, qui, pourquoi et la limite telle qu'elle jugeait.
   */
  private async recordOverrides(
    orderId: string,
    request: StaffPlacementRequest,
    debts: DeadlineDebts,
  ): Promise<void> {
    const serviceDay = request.payload.requestedDeliveryDate;
    if (debts.overrideReason === null || serviceDay === null) {
      return;
    }
    await this.ports.overrides.record(
      itemLimitOverridesOf({
        exceeded: debts.exceeded,
        orderId,
        staffUserId: request.staffUserId,
        reason: debts.overrideReason,
        serviceDay,
        origin: "placement",
        at: this.ports.clock.now(),
        nextId: () => this.ports.ids.next(),
      }),
    );
  }

  /**
   * Décide le règlement. `account` exige un crédit réellement accordé — sans quoi
   * un écran de back-office suffirait à en inventer un. `link` crée l'intention
   * Stripe, sauf sur un total nul où il n'y a rien à encaisser — et, sur la
   * vitrine, suit le réglage du pro sans crédit (Q7).
   */
  private async settle(
    order: Order,
    payload: AdminPlaceOrderPayload,
  ): Promise<PreparedCardPayment | null> {
    const { settlement, companyId } = payload;
    // Le prédicat que l'estimation partage (lot P2) : ici, il refuse.
    const refusal = await staffSettlementRefusal(
      { guard: this.ports.guard, shelf: this.ports.shelf },
      order,
      settlement,
      companyId,
      isCounterEntry(payload.entryOrigin, payload.entryShortcut),
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
    const { prepared } = await this.ports.payments.prepare(
      ORDER_CARD_SUBJECT_TYPE,
      order.totalCents,
      orderCardTag(companyId),
    );
    order.payByCard(prepared.providerRef);
    return prepared;
  }
}
