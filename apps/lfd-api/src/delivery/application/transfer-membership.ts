import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../platform/events/domain-event-publisher.js";
import { Clock } from "../../platform/time/clock.js";
import {
  DeliveryOrdersReader,
  type TransferOrderRef,
  TransferOrdersReader,
} from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import {
  type CitedOrder,
  InternalTransferOrderDetachedEvent,
  InternalTransferOrderKeptEvent,
} from "../domain/events/internal-transfer.events.js";
import { DeliveryDayReadinessRepository } from "../domain/ports/delivery-day-readiness.repository.js";
import { InternalTransferRepository } from "../domain/ports/internal-transfer.repository.js";
import { loadTransfer } from "./internal-transfer-support.js";
import { TransferAttachment } from "./transfer-attachment.js";
import { TransferPlacer } from "./transfer-placer.js";

/**
 * **Une commande est-elle dans le BON transfert ?** (plan du transfert
 * interne, lot T2, décisions 3 et 4 de Hugo du 2026-10-13) — la question que
 * posent les abonnés aux faits du commerce : passée, annulée.
 *
 * Il relit la commande au commerce (`TransferOrdersReader` : un retrait actif
 * d'un site servi par transfert, son site et son jour) et la compare au
 * transfert qui la porte :
 *
 * - même site, même jour : rien ;
 * - un autre, ou plus de retrait du tout (annulée) : elle SORT du transfert
 *   tant qu'il est prévu ; parti ou reçu, rien ne bouge — le manifeste figé
 *   fait foi, une ligne au journal le dit, et elle n'entre nulle part ailleurs
 *   (sa marchandise voyage déjà) ;
 * - sans transfert, et la journée de son retrait est déjà close : elle entre
 *   dans le transfert prévu de son site et de son jour, ou dans un autre
 *   (Q-T3), qui sera placé. Journée pas close : la clôture s'en chargera.
 *
 * Idempotent : rejoué, il trouve l'état qu'il a laissé. À appeler DANS la
 * transaction de l'abonné.
 */
@Injectable()
export class TransferMembership {
  constructor(
    private readonly orders: TransferOrdersReader,
    private readonly facts: DeliveryOrdersReader,
    private readonly transfers: InternalTransferRepository,
    private readonly days: DeliveryDayReadinessRepository,
    private readonly attachment: TransferAttachment,
    private readonly placer: TransferPlacer,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async reconcile(orderId: string): Promise<void> {
    const [ref] = await this.orders.transferOrdersAmong([orderId]);
    const holderId = await this.transfers.holderOf({ kind: "order", orderId });
    if (holderId !== null) {
      const holder = await loadTransfer(this.transfers, holderId);
      if (ref !== undefined && ref.day === holder.serviceDay && ref.siteId === holder.siteId) {
        return;
      }
      if (!(await this.leave(holder, orderId, ref === undefined ? "cancelled" : "moved"))) {
        return;
      }
    }
    if (ref !== undefined) {
      await this.join(ref);
    }
  }

  /** Rend `true` si la commande est sortie ; `false` : le transfert l'emporte quand même. */
  private async leave(
    holder: InternalTransfer,
    orderId: string,
    cause: "cancelled" | "moved",
  ): Promise<boolean> {
    const outcome = holder.detachOrder(orderId, this.clock.now());
    const order = await this.cite(orderId);
    if (outcome === "frozen") {
      await this.events.publishTraced(new InternalTransferOrderKeptEvent(holder, order, cause));
      return false;
    }
    if (outcome === "detached") {
      await this.transfers.save(holder);
      await this.events.publishTraced(new InternalTransferOrderDetachedEvent(holder, order, cause));
    }
    return true;
  }

  private async join(ref: TransferOrderRef): Promise<void> {
    const day = await this.days.load(ref.day);
    if (day === null || day.closedAt === null) {
      return;
    }
    if ((await this.attachment.attachAmong([ref.orderId])) > 0) {
      this.placer.placeDaySoon(ref.day);
    }
  }

  private async cite(orderId: string): Promise<CitedOrder> {
    const [facts] = await this.facts.byIds([orderId]);
    return { id: orderId, name: facts?.reference ?? orderId };
  }
}
