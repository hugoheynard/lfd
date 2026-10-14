import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf } from "../packing/payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_DAY_REOPENED = "production.day_reopened";

/**
 * **Une journée arrêtée vient d'être rouverte** — fait DURABLE (Hugo,
 * 2026-10-14, `documentation/plan-de-lancement-2026-11-20.md`, §3).
 *
 * Le fournil le publie dans l'unité de travail de la réouverture ; il ne sait
 * pas qui l'écoute. Trois blocs en tirent ce qui les concerne : le commerce
 * rend `placed` les commandes que CET arrêt avait confirmées, le colisage
 * retire sa liste du jour, la livraison oublie le plan et sort ses arrêts des
 * tournées au dépôt. Rien de tout cela n'a commencé : le fournil a refusé la
 * réouverture sinon.
 *
 * ## `closedAt` : l'arrêt DÉFAIT, et pourquoi il voyage
 *
 * La boîte d'envoi ne garantit aucun ordre entre deux faits. Si un nouvel
 * arrêt est passé avant que l'abonné ne reçoive celui-ci, défaire « la
 * journée » défairait le nouveau plan. Chaque abonné vérifie donc que la
 * journée est TOUJOURS ouverte (`ClosedPlansReader`) avant d'agir, et le
 * commerce borne sa remise aux commandes confirmées à `closedAt`.
 *
 * Clé : `production.day_reopened:<serviceDay>:<reopenedAt>` — une
 * réouverture, un fait.
 */
export class ProductionDayReopenedEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    readonly reopenedAt: Date,
    /** L'instant de l'arrêt que la réouverture défait. */
    readonly closedAt: Date,
    /** Les commandes que le plan défait portait. */
    readonly orderIds: readonly string[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_DAY_REOPENED,
      key: `${PRODUCTION_DAY_REOPENED}:${this.serviceDay}:${this.reopenedAt.toISOString()}`,
      payload: {
        serviceDay: this.serviceDay,
        reopenedAt: this.reopenedAt.toISOString(),
        closedAt: this.closedAt.toISOString(),
        orderIds: [...this.orderIds],
      },
    };
  }

  /**
   * Relit le contrat côté abonné.
   *
   * @throws {ProductionDayReopenedPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductionDayReopenedEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const reopenedAt = instantOf(payload["reopenedAt"]);
    const closedAt = instantOf(payload["closedAt"]);
    const orderIds = payload["orderIds"];
    if (
      serviceDay === null ||
      reopenedAt === null ||
      closedAt === null ||
      !Array.isArray(orderIds) ||
      !orderIds.every((id): id is string => typeof id === "string")
    ) {
      throw new ProductionDayReopenedPayloadError();
    }
    return new ProductionDayReopenedEvent(serviceDay, reopenedAt, closedAt, orderIds);
  }
}

/** Le fait `production.day_reopened` reçu ne respecte pas son contrat. */
export class ProductionDayReopenedPayloadError extends TechnicalError {
  constructor() {
    super(
      "production_day_reopened.payload_invalid",
      "Le fait « journée rouverte » reçu est illisible (journée, instants ou commandes " +
        "manquants) : rien n'a été défait chez l'abonné. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
