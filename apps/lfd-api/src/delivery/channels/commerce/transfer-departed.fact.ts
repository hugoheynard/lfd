import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { instantOf, textOf, textsOf } from "../handover/fact-fields.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const DELIVERY_TRANSFER_DEPARTED = "delivery.transfer_departed";

/**
 * **Un transfert interne part avec sa tournée** — fait DURABLE (lot R4d de
 * `reassort-boutiques/plan-au-plus-tot.md`, 2026-10-22).
 *
 * Écrit dans la boîte d'envoi par `departAndFreeze`, le chemin commun aux deux
 * portes du départ, dans la transaction du départ, pour chaque transfert qui
 * part vraiment (un transfert déjà parti ou déjà reçu n'en écrit pas). Le
 * commerce en tire « réassort parti » pour les réassorts qu'il porte — un
 * AFFICHAGE, aucun refus n'en dépend. La livraison ne sait pas qui écoute.
 *
 * Distinct de `DeliveryRoundDepartedFact`, qui ne nomme que les commandes de
 * la tournée : les transferts n'y sont pas (ce sont des retraits).
 *
 * Clé : `delivery.transfer_departed:<transferId>`. Un transfert ne part qu'une
 * fois (`InternalTransfer.depart` rend `false` au second passage).
 */
export class TransferDepartedFact implements DurableEvent {
  constructor(
    readonly transferId: string,
    /** Le point de retrait que le transfert sert. */
    readonly siteId: string,
    /** `AAAA-MM-JJ` — le jour de service du transfert. */
    readonly serviceDay: string,
    /** L'instant du départ, posé par la tournée — jamais celui de la livraison du fait. */
    readonly departedAt: Date,
    /** La fiche staff du livreur de la tournée ; `null` pour une tournée sans livreur. */
    readonly driverStaffId: string | null,
    /** Les réassorts que le transfert emporte ; vide s'il n'en porte aucun. */
    readonly resupplyIds: readonly string[],
  ) {}

  durableFact(): DurableFact {
    return {
      type: DELIVERY_TRANSFER_DEPARTED,
      key: `${DELIVERY_TRANSFER_DEPARTED}:${this.transferId}`,
      payload: {
        transferId: this.transferId,
        siteId: this.siteId,
        serviceDay: this.serviceDay,
        departedAt: this.departedAt.toISOString(),
        driverStaffId: this.driverStaffId,
        resupplyIds: [...this.resupplyIds],
      },
    };
  }

  /** @throws {TransferDepartedPayloadError} un payload hors contrat. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): TransferDepartedFact {
    const transferId = textOf(payload["transferId"]);
    const siteId = textOf(payload["siteId"]);
    const serviceDay = textOf(payload["serviceDay"]);
    const departedAt = instantOf(payload["departedAt"]);
    const driver = payload["driverStaffId"];
    const resupplyIds = textsOf(payload["resupplyIds"]);
    const driverStaffId = driver === null ? null : textOf(driver);
    if (
      transferId === null ||
      siteId === null ||
      serviceDay === null ||
      departedAt === null ||
      (driver !== null && driverStaffId === null) ||
      resupplyIds === null
    ) {
      throw new TransferDepartedPayloadError();
    }
    return new TransferDepartedFact(
      transferId,
      siteId,
      serviceDay,
      departedAt,
      driverStaffId,
      resupplyIds,
    );
  }
}

/** Le fait `delivery.transfer_departed` reçu ne respecte pas son contrat. */
export class TransferDepartedPayloadError extends TechnicalError {
  constructor() {
    super(
      "delivery_transfer_departed.payload_invalid",
      "Le fait « transfert parti » est illisible (transfert, point, jour, instant, livreur ou " +
        "réassorts manquants) : ses réassorts ne sont pas passés à « parti ». Le message reste " +
        "dans la boîte d'envoi ; corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
