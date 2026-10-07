import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf, textsOf } from "./fact-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const DELIVERY_ROUND_DEPARTED = "delivery.round_departed";

/**
 * **Une tournée vient de partir** — fait DURABLE depuis le 2026-10-06 (plan
 * `documentation/livraisons/livreur/plan-depart-durable.md`, §5, DD1).
 *
 * Écrit dans la boîte d'envoi par `departAndFreeze`, le seul chemin commun aux
 * deux portes du départ (chargeur, livreur), dans la transaction du départ : un
 * départ annulé n'a pas de fait, un départ validé est livré au moins une fois.
 * Le retrait en tire la garde passée au livreur, le commerce le courriel
 * « en route » — la livraison ne sait pas qui écoute.
 *
 * ⚠️ Classe DISTINCTE de `DeliveryRoundDepartedEvent`, qui reste et écrit le
 * journal : un fait de journal et un fait durable ont deux lecteurs et deux
 * contrats (même partage que `ProductionDayClosedJournalEvent` /
 * `ProductionDayClosedEvent`).
 *
 * Clé : `delivery.round_departed:<roundId>`. Une tournée ne part qu'une fois
 * (l'agrégat refuse le second départ) ; un second passage est une autre tournée.
 *
 * 🔴 Il vit dans le CANAL : réexporté par `channels/handover/` et
 * `channels/commerce/`, la même classe pour les deux.
 */
export class DeliveryRoundDepartedFact implements DurableEvent {
  constructor(
    readonly roundId: string,
    /** `AAAA-MM-JJ` — le jour de service de la tournée. */
    readonly serviceDay: string,
    /** L'instant du départ, posé par la tournée — jamais celui de la livraison du fait. */
    readonly departedAt: Date,
    /** Les commandes des arrêts vivants au départ. */
    readonly orderIds: readonly string[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: DELIVERY_ROUND_DEPARTED,
      key: `${DELIVERY_ROUND_DEPARTED}:${this.roundId}`,
      payload: {
        roundId: this.roundId,
        serviceDay: this.serviceDay,
        departedAt: this.departedAt.toISOString(),
        orderIds: [...this.orderIds],
      },
    };
  }

  /** @throws {DeliveryRoundDepartedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): DeliveryRoundDepartedFact {
    const roundId = textOf(payload["roundId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const departedAt = instantOf(payload["departedAt"]);
    const orderIds = textsOf(payload["orderIds"]);
    if (roundId === null || serviceDay === null || departedAt === null || orderIds === null) {
      throw new DeliveryRoundDepartedPayloadError();
    }
    return new DeliveryRoundDepartedFact(roundId, serviceDay, departedAt, orderIds);
  }
}

/** Le fait `delivery.round_departed` reçu ne respecte pas son contrat. */
export class DeliveryRoundDepartedPayloadError extends TechnicalError {
  constructor() {
    super(
      "delivery_round_departed.payload_invalid",
      "Le fait « tournée partie » reçu est illisible (tournée, jour, instant ou commandes " +
        "manquants) : ni la garde ni le courriel n'ont suivi. Le message reste dans la boîte " +
        "d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
