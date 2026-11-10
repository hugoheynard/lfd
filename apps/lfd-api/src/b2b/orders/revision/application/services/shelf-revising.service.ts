import { Injectable } from "@nestjs/common";

import { sameDayDoorOf } from "../../../../order-cutoffs/domain/same-day-doors.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../../domain/entities/order-revision.js";
import type { SameDayOrderClosedError } from "../../../domain/errors/same-day-order-closed.error.js";
import type { NoPickupLeftTodayError } from "../../../domain/errors/shelf-circuit-errors.js";
import { ShelfOrderNotTodayError } from "../../../domain/errors/shelf-order-errors.js";
import type { RevisionVerdict } from "../../domain/services/order-revisability.js";
import { revisedShelfClaimOf, shelfClaimOf } from "../../../domain/services/shelf-circuit.js";
import { OrderPlanGate } from "../../../application/services/order-plan-gate.service.js";
import { ShelfCircuit } from "../../../application/services/shelf-circuit.service.js";

type ShelfRevisionRefusal =
  SameDayOrderClosedError | NoPickupLeftTodayError | ShelfOrderNotTodayError;

/**
 * **Les gardes du circuit du jour J, pour la révision d'une commande sur
 * stock** (plan `documentation/limites-de-commande/jour-meme-sur-stock.md`,
 * §12 bloquant 2, §13, lot L5) — à la place de l'arrêt du plan, de l'heure
 * limite et du verrou de journée, que la révision d'une commande fabriquée
 * applique.
 *
 * - **La porte** : celle de qui modifie (le réglage de sa clientèle, et le
 *   créneau restant au point — aucun au comptoir), la règle de la passation ;
 * - **la journée** : aujourd'hui. Une commande sur stock d'un jour passé ne
 *   puise plus dans aucune vitrine ;
 * - **le reste**, sous le verrou du stock : seules les hausses s'y jugent.
 *
 * Les lignes et les quantités changent ; le mode, la journée et le point,
 * non — c'est l'agrégat qui le refuse (`ensureShelfKeepsRoute`).
 */
@Injectable()
export class ShelfRevising {
  constructor(
    private readonly circuit: ShelfCircuit,
    private readonly plans: OrderPlanGate,
  ) {}

  /** Ce que les vues disent de la modification : la même règle que le geste, sans verrou. */
  async verdictOf(
    order: RevisableOrder,
    actorKind: RevisionActor["kind"],
  ): Promise<RevisionVerdict> {
    const refusal = await this.refusalOf(order, actorKind);
    return refusal === null
      ? { revisable: true, until: null }
      : { revisable: false, block: { kind: "shelf_closed", reason: refusal.message } };
  }

  /**
   * Hors verrou, avant la recomposition : refuser tôt.
   *
   * @throws {ShelfOrderNotTodayError} la commande n'est pas d'aujourd'hui.
   * @throws {SameDayOrderClosedError} le réglage ne l'ouvre pas à cette porte.
   * @throws {NoPickupLeftTodayError} le point n'a plus de créneau aujourd'hui.
   */
  async ensureOpen(order: RevisableOrder, actorKind: RevisionActor["kind"]): Promise<void> {
    const refusal = await this.refusalOf(order, actorKind);
    if (refusal !== null) {
      throw refusal;
    }
  }

  /**
   * **Sous le verrou de la ligne `orders`**, dans la transaction de la
   * révision : le verrou du stock, puis le reste rejugé sur les hausses. La
   * recomposition hors transaction ne fait foi de rien (§13, sérieux).
   *
   * @throws {ShelfStockShortError} une hausse dépasse ce qui reste.
   */
  async hold(order: RevisableOrder, revision: OrderRevisionToSave): Promise<void> {
    const before = revisedShelfClaimOf(order);
    const after = shelfClaimOf(revision.state);
    if (before === null || after === null) {
      return;
    }
    await this.circuit.holdRevision(before, after);
  }

  private async refusalOf(
    order: RevisableOrder,
    actorKind: RevisionActor["kind"],
  ): Promise<ShelfRevisionRefusal | null> {
    const today = this.plans.today();
    if (order.serviceDay !== today) {
      return new ShelfOrderNotTodayError(order.serviceDay, today);
    }
    return this.circuit.refusalFor(
      sameDayDoorOf(order.companyId, actorKind === "staff"),
      order.fulfillment.pickupAddress?.siteId ?? null,
    );
  }
}
