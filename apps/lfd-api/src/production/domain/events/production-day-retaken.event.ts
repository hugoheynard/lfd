import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, piecesOf, textOf } from "../../channels/packing/payload-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_DAY_RETAKEN = "production.day_retaken";

/**
 * **Le tirage d'une journée arrêtée vient d'être repris** — fait DURABLE
 * (plan `documentation/production/dossier-prod-du-jour.md`, décision 2,
 * lot E3).
 *
 * Publié par `RetakeProductionDayHandler` dans l'unité de travail du retirage,
 * et SEULEMENT quand des commandes ont été absorbées : un retirage à zéro ne
 * change ni la journée ni `retaken`, il n'y a donc rien de neuf à annoncer.
 *
 * Il vit dans le DOMAINE et non dans un canal : son seul abonné est le
 * fournil lui-même (l'envoi du dossier complété). Le jour où un autre bloc
 * l'écoutera, il passera dans le canal de ce bloc.
 *
 * Clé : `production.day_retaken:<serviceDay>:<retakenAt>` — un retirage, un
 * fait ; deux retirages ont deux instants.
 */
export class ProductionDayRetakenEvent implements DurableEvent {
  constructor(
    /** `AAAA-MM-JJ`. */
    readonly serviceDay: string,
    /** L'instant du retirage — celui que la journée garde en `retaken.at`. */
    readonly retakenAt: Date,
    /** Les commandes absorbées, ≥ 1. */
    readonly absorbed: number,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_DAY_RETAKEN,
      key: `${PRODUCTION_DAY_RETAKEN}:${this.serviceDay}:${this.retakenAt.toISOString()}`,
      payload: {
        serviceDay: this.serviceDay,
        retakenAt: this.retakenAt.toISOString(),
        absorbed: this.absorbed,
      },
    };
  }

  /**
   * Relit le contrat côté abonné.
   *
   * @throws {ProductionDayRetakenPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductionDayRetakenEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const retakenAt = instantOf(payload["retakenAt"]);
    const absorbed = piecesOf(payload["absorbed"]);
    if (serviceDay === null || retakenAt === null || absorbed === null) {
      throw new ProductionDayRetakenPayloadError();
    }
    return new ProductionDayRetakenEvent(serviceDay, retakenAt, absorbed);
  }
}

/** Le fait `production.day_retaken` reçu ne respecte pas son contrat. */
export class ProductionDayRetakenPayloadError extends TechnicalError {
  constructor() {
    super(
      "production_day_retaken.payload_invalid",
      "Le fait « tirage repris » reçu est illisible (journée, instant ou nombre de commandes " +
        "manquants) : le dossier complété n'est pas parti. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
