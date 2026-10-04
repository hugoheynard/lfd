import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_DAY_CLOSED = "production.day_closed";

/**
 * **Une journée de fabrication vient d'être arrêtée** — fait DURABLE depuis le
 * 2026-10-04 (plan `documentation/journalisation/plan-boite-d-envoi.md`, §7 :
 * la clôture est le premier client de la boîte d'envoi).
 *
 * Le fait appartient à la production : c'est elle qui décide qu'une journée
 * bascule. Le commerce l'apprend et en tire ses conséquences — ses commandes
 * passent `confirmed` — sans que la production ait à le savoir.
 *
 * ## Le contrat (le payload), et pourquoi il porte les commandes
 *
 * `{ serviceDay, closedAt, orderIds }` — rien d'autre, aucune forme Prisma.
 * `orderIds` est l'instantané que la production a compté : l'abonné n'absorbe
 * QUE celles-là. Sans eux, une livraison tardive (reprise, rejeu d'un message
 * mort) confirmait aussi les commandes passées APRÈS l'arrêt, que le fournil
 * n'a jamais comptées, et les datait d'une clôture qui ne les avait pas vues.
 *
 * ## La clé
 *
 * - Clôture : `production.day_closed:<serviceDay>:<closedAt>`. Une journée ne se
 *   clôt qu'une fois (l'agrégat refuse la seconde), donc la clé est unique par
 *   plan arrêté ; si un jour une réouverture existe, la nouvelle clôture aura
 *   un autre instant, donc sera un autre fait.
 * - Réannonce : `…:<closedAt>:reannounced:<instant de la réannonce>`. Elle ne
 *   change pas l'instantané mais peut changer ce qu'il CONTIENT (un retirage y
 *   ajoute des commandes, et c'est la réannonce qui les fait apprendre au
 *   commerce — cf. `RetakeProductionDayHandler`). Surtout, c'est un geste humain
 *   de réparation : la dédupliquer en silence ferait d'un bouton un geste sans
 *   effet. Chaque pression est donc un fait, et l'effet reste borné par
 *   `orderIds` et par `status: placed`.
 *
 * 🔴 **Il vit dans le CANAL, pas dans le domaine** : un fait qu'un autre bloc
 * consomme fait partie de la surface publiée, au même titre qu'un port.
 */
export class ProductionDayClosedEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ` — la journée arrêtée. */
    readonly serviceDay: string,
    /** L'instant de la clôture **d'origine**, jamais celui du rejeu. */
    readonly closedAt: Date,
    /** Les commandes de l'instantané — les seules que le commerce absorbe. */
    readonly orderIds: readonly string[],
    /** Présent sur une réannonce : l'instant du geste, pour la clé seulement. */
    readonly reannouncedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    const base = `${PRODUCTION_DAY_CLOSED}:${this.serviceDay}:${this.closedAt.toISOString()}`;
    return {
      type: PRODUCTION_DAY_CLOSED,
      key:
        this.reannouncedAt === null
          ? base
          : `${base}:reannounced:${this.reannouncedAt.toISOString()}`,
      payload: {
        serviceDay: this.serviceDay,
        closedAt: this.closedAt.toISOString(),
        orderIds: [...this.orderIds],
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un payload hors forme est une faute d'émetteur :
   * la livraison échoue, est reprise, puis finit en message mort visible.
   *
   * @throws {ProductionDayClosedPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductionDayClosedEvent {
    const { serviceDay, closedAt, orderIds } = payload;
    const at = typeof closedAt === "string" ? new Date(closedAt) : null;
    if (
      typeof serviceDay !== "string" ||
      at === null ||
      Number.isNaN(at.getTime()) ||
      !Array.isArray(orderIds) ||
      !orderIds.every((id): id is string => typeof id === "string")
    ) {
      throw new ProductionDayClosedPayloadError();
    }
    return new ProductionDayClosedEvent(serviceDay, at, orderIds);
  }
}

/** Le fait `production.day_closed` reçu ne respecte pas son contrat. */
export class ProductionDayClosedPayloadError extends TechnicalError {
  constructor() {
    super(
      "production_day_closed.payload_invalid",
      "Le fait « journée arrêtée » reçu est illisible (journée, instant ou commandes manquants) : " +
        "le commerce n'a rien confirmé. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
