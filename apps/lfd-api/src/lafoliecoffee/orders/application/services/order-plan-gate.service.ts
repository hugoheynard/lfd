import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  ClosedPlansReader,
  PlanAdmissionDesk,
  ServiceDay,
} from "../../../../production/channels/commerce/index.js";
import type { Instant } from "../../../../platform/context/request-context.js";
import { Clock } from "../../../../platform/time/clock.js";
import { type SameDayDoor, sameDayOpenTo } from "../../../order-cutoffs/domain/same-day-doors.js";
import { SameDayOrderClosedError } from "../../domain/errors/same-day-order-closed.error.js";
import { SameDayOrderReader } from "../../domain/ports/same-day-order.reader.js";

/**
 * **L'arrêt du plan, lu pour la passation** (plan
 * `documentation/commandes/passation/plan-reglages-commandes.md`, §8 point 3, §8.1 S5 et
 * §8.3, lot O3) — client, boutique et saisie de l'équipe, par `OrderDrafting`.
 *
 * Deux temps, et les deux sont nécessaires :
 *
 * 1. {@link isClosed}, SANS verrou, en composant la commande : un refus tôt
 *    du client, avant l'intention Stripe et la dérogation ;
 * 2. {@link hold}, SOUS le verrou de la journée, dans la transaction qui écrit
 *    la commande et AVANT elle : l'arrêt qui tomberait entre les deux est vu
 *    ici. Sans ce second temps, le premier ne fermerait pas O5.
 *
 * Il CONSTATE, il ne décide pas : refuser le client ou recevoir la saisie de
 * l'équipe « hors plan » est la règle de l'agrégat (`Order.receiveOffPlan`).
 * Sans journée demandée, rien n'est arrêté. Porte aussi le réglage « jour
 * même » (§8.3) : les deux décident du premier jour qu'on peut demander —
 * par clientèle depuis le lot L4 du circuit du jour J (`sameDayOpenTo`).
 */
@Injectable()
export class OrderPlanGate {
  constructor(
    private readonly plans: ClosedPlansReader,
    private readonly desk: PlanAdmissionDesk,
    private readonly sameDay: SameDayOrderReader,
    private readonly clock: Clock,
  ) {}

  /**
   * Le réglage « jour même » de CETTE porte (§8.3 ; par clientèle depuis le
   * lot L4) : sans lui, aujourd'hui — et a fortiori une journée passée — est
   * refusé. Aucun délai n'est codé ici. `at` : l'instant du geste (plan S2,
   * R6) — l'horloge pour la passation et M1.
   *
   * @throws {SameDayOrderClosedError} la journée n'est pas après aujourd'hui, et le réglage ne l'ouvre pas à cette porte.
   */
  async ensureNotTooSoon(day: string | null, door: SameDayDoor, at: Instant): Promise<void> {
    if (day === null || day > instantToLocal(at).day) {
      return;
    }
    if (!sameDayOpenTo(await this.sameDay.settings(), door)) {
      throw new SameDayOrderClosedError(day);
    }
  }

  /** La journée de Paris, à l'horloge du serveur. */
  today(): string {
    return instantToLocal(this.clock.now()).day;
  }

  /** Le plan de la journée est-il arrêté ? Sans verrou : pour refuser tôt. */
  async isClosed(day: string | null): Promise<boolean> {
    if (day === null) {
      return false;
    }
    return (await this.plans.closedBetween(day, day)).length > 0;
  }

  /**
   * Prend le verrou de la journée dans l'unité de travail EN COURS, puis relit
   * l'arrêt. À appeler en premier dans la transaction de la passation : la
   * journée avant toute ligne `orders` (C3.4 ter).
   */
  async hold(day: string | null): Promise<boolean> {
    if (day === null) {
      return false;
    }
    return (await this.desk.admit(ServiceDay.of(day))) === "closed";
  }
}
