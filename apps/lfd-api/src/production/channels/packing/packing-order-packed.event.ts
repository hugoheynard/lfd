import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  shipmentKeySuffix,
  shipmentRankOf,
} from "../../domain/value-objects/shipment-ref.value-object.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PACKING_ORDER_PACKED = "packing.order_packed";

/**
 * **Le bac d'une commande est fait — au colisage** (plan
 * `documentation/colisage/colisage.md`, §12.1, K2).
 *
 * Le SEUL fait « bac fait » depuis K3c : `production.order_packed`, que
 * publiait l'ancien poste du fournil, est retiré avec lui (§17.3). Le commerce
 * en tire le sien — `ready` — et publie `OrderReadyEvent`. Les nommer pareil
 * serait une erreur : « colisé » dit ce qu'on a fait, « prête » ce que le
 * client peut attendre.
 *
 * La charge : `{ orderId, rank, reference, packedAt, packedBy }` — ni forme
 * Prisma, ni montant, ni ligne. La **référence** est ce que le commerce
 * résout ; un fait écrit avant `rank` se relit au rang 1.
 *
 * La clé : `packing.order_packed:<orderId>`, `…:<orderId>:r<rang>` pour le bac
 * d'un reliquat (plan E7 reliquat, choix 6 — la clé manquait à la première
 * annexe A, et l'aurait avalé) ; refermer après « Rouvrir » publie
 * la même clé, absorbée. Fermer un bac déjà fermé publie un fait NEUF
 * (`…:reannounced:<instant>`) : la réannonce, filet humain d'un abonné perdu.
 *
 * Déclaré par le fournil dans son canal (§12.1) — le colisage le publie, le
 * commerce le lit par `production/channels/commerce/`.
 */
export class PackingOrderPackedEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    /** Le rang de l'envoi colisé — 1 = la commande (plan E7 reliquat, choix 5). */
    readonly rank: number,
    readonly reference: string,
    /** L'instant de la fermeture d'ORIGINE, jamais celui d'un rescan. */
    readonly packedAt: Date,
    /** La fiche staff qui a fermé. */
    readonly packedBy: string,
    /** Présent sur un rescan : l'instant du geste, pour la clé seulement. */
    readonly reannouncedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    const base = `${PACKING_ORDER_PACKED}:${this.orderId}${shipmentKeySuffix(this.rank)}`;
    return {
      type: PACKING_ORDER_PACKED,
      key:
        this.reannouncedAt === null
          ? base
          : `${base}:reannounced:${this.reannouncedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        rank: this.rank,
        reference: this.reference,
        packedAt: this.packedAt.toISOString(),
        packedBy: this.packedBy,
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un payload hors forme est une faute
   * d'émetteur : la livraison échoue, est reprise, puis reste en message mort.
   *
   * @throws {PackingOrderPackedPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): PackingOrderPackedEvent {
    const { orderId, reference, packedAt, packedBy } = payload;
    const at = typeof packedAt === "string" ? new Date(packedAt) : null;
    const rank = shipmentRankOf(payload["rank"]);
    if (
      typeof orderId !== "string" ||
      rank === null ||
      typeof reference !== "string" ||
      typeof packedBy !== "string" ||
      at === null ||
      Number.isNaN(at.getTime())
    ) {
      throw new PackingOrderPackedPayloadError();
    }
    return new PackingOrderPackedEvent(orderId, rank, reference, at, packedBy);
  }
}

/** Le fait `packing.order_packed` reçu ne respecte pas son contrat. */
export class PackingOrderPackedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_packed.payload_invalid",
      "Le fait « bac fait » reçu est illisible (commande, rang, référence, instant ou auteur manquant) : " +
        "le commerce n'a pas déclaré la commande prête. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
