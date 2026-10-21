import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf, textsOf } from "../handover/fact-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const DELIVERY_TRANSFER_RECEIVED = "delivery.transfer_received";

/**
 * **Un transfert interne est reçu à son site** — fait DURABLE (lot R3e de
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-22).
 *
 * Écrit dans la boîte d'envoi par les DEUX chemins de la réception — « Remis
 * au site » du livreur, « Réceptionner » au comptoir — dans leur transaction :
 * une réception annulée n'a pas de fait. Le commerce en tire « réassort
 * arrivé » pour les réassorts que le transfert porte ; la livraison ne sait
 * pas qui écoute.
 *
 * Distinct d'`InternalTransferReceivedEvent`, qui reste et écrit le journal
 * (même partage que `DeliveryRoundDepartedFact`).
 *
 * Clé : `delivery.transfer_received:<transferId>`. Un transfert n'est reçu
 * qu'une fois (l'agrégat refuse la seconde réception).
 */
export class TransferReceivedFact implements DurableEvent {
  constructor(
    readonly transferId: string,
    /** Le point de retrait que le transfert sert. */
    readonly siteId: string,
    /** `AAAA-MM-JJ` — le jour de service du transfert. */
    readonly serviceDay: string,
    /** L'instant de la réception, posé par le transfert. */
    readonly receivedAt: Date,
    /** La fiche staff de qui l'a reçu : le livreur, ou le comptoir. */
    readonly receivedByStaffId: string,
    /** Les réassorts que le transfert porte à la réception ; vide s'il n'en porte aucun. */
    readonly resupplyIds: readonly string[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: DELIVERY_TRANSFER_RECEIVED,
      key: `${DELIVERY_TRANSFER_RECEIVED}:${this.transferId}`,
      payload: {
        transferId: this.transferId,
        siteId: this.siteId,
        serviceDay: this.serviceDay,
        receivedAt: this.receivedAt.toISOString(),
        receivedByStaffId: this.receivedByStaffId,
        resupplyIds: [...this.resupplyIds],
      },
    };
  }

  /** @throws {TransferReceivedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): TransferReceivedFact {
    const transferId = textOf(payload["transferId"]);
    const siteId = textOf(payload["siteId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const receivedAt = instantOf(payload["receivedAt"]);
    const by = textOf(payload["receivedByStaffId"]);
    const resupplyIds = textsOf(payload["resupplyIds"]);
    if (
      transferId === null ||
      siteId === null ||
      serviceDay === null ||
      receivedAt === null ||
      by === null ||
      resupplyIds === null
    ) {
      throw new TransferReceivedPayloadError();
    }
    return new TransferReceivedFact(transferId, siteId, serviceDay, receivedAt, by, resupplyIds);
  }
}

/** Le fait `delivery.transfer_received` reçu ne respecte pas son contrat. */
export class TransferReceivedPayloadError extends TechnicalError {
  constructor() {
    super(
      "delivery_transfer_received.payload_invalid",
      "Le fait « transfert reçu » est illisible (transfert, point, jour, instant, auteur ou " +
        "réassorts manquants) : ses réassorts ne sont pas passés à « arrivé ». Le message reste " +
        "dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
