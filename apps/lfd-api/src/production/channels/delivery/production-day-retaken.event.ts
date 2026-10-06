import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, piecesOf, textOf } from "../packing/payload-fields.js";

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
 * Il vit dans le canal de la LIVRAISON depuis le 2026-10-06 (plan
 * `livraisons/plan-composition-automatique.md`, §16.5, CA6b) : la livraison
 * l'écoute pour apprendre les livraisons ajoutées au plan arrêté. Le fournil
 * reste abonné lui-même (l'envoi du dossier complété).
 *
 * `orderIds` : les commandes ABSORBÉES par ce retirage. Les faits écrits avant
 * CA6b n'en ont pas ; la relecture les rend avec `orderIds: null` plutôt que de
 * lever — sans quoi chaque fait en attente deviendrait un message mort. Deux
 * sources de la liste des arrivées coexistent (`publishArrivals` pour le
 * colisage, ce fait pour la livraison) : assumé, chacune sert son canal (S4).
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
    /** Les commandes absorbées ; `null` sur un fait écrit avant CA6b. */
    readonly orderIds: readonly string[] | null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: PRODUCTION_DAY_RETAKEN,
      key: `${PRODUCTION_DAY_RETAKEN}:${this.serviceDay}:${this.retakenAt.toISOString()}`,
      payload: {
        serviceDay: this.serviceDay,
        retakenAt: this.retakenAt.toISOString(),
        absorbed: this.absorbed,
        ...(this.orderIds === null ? {} : { orderIds: [...this.orderIds] }),
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un fait sans `orderIds` (antérieur à CA6b)
   * se relit avec `orderIds: null` ; une liste PRÉSENTE mais mal formée, elle,
   * est refusée.
   *
   * @throws {ProductionDayRetakenPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): ProductionDayRetakenEvent {
    const serviceDay = textOf(payload["serviceDay"]);
    const retakenAt = instantOf(payload["retakenAt"]);
    const absorbed = piecesOf(payload["absorbed"]);
    const orderIds = orderIdsOf(payload["orderIds"]);
    if (serviceDay === null || retakenAt === null || absorbed === null || orderIds === false) {
      throw new ProductionDayRetakenPayloadError();
    }
    return new ProductionDayRetakenEvent(serviceDay, retakenAt, absorbed, orderIds);
  }
}

/** Absente → `null` (ancien fait) ; présente mais illisible → `false`. */
function orderIdsOf(value: unknown): readonly string[] | null | false {
  if (value === undefined) {
    return null;
  }
  if (!Array.isArray(value) || !value.every((id): id is string => typeof id === "string")) {
    return false;
  }
  return value;
}

/** Le fait `production.day_retaken` reçu ne respecte pas son contrat. */
export class ProductionDayRetakenPayloadError extends TechnicalError {
  constructor() {
    super(
      "production_day_retaken.payload_invalid",
      "Le fait « tirage repris » reçu est illisible (journée, instant, nombre ou liste de " +
        "commandes manquants) : le dossier complété n'est pas parti. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
