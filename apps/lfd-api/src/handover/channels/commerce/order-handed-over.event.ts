import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { shipmentKeySuffix, shipmentRankOf } from "../../../production/channels/handover/index.js";
import type { HandoverVia } from "../../domain/services/handover.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const HANDOVER_HANDED_OVER = "handover.handed_over";

const VIAS: readonly HandoverVia[] = ["scan", "manual", "deposit"];

/**
 * **Une commande a été retirée** — constaté au comptoir, ou à la porte.
 *
 * ## Deux faits, pas un — comme pour le colisage
 *
 * Celui-ci appartient au RETRAIT : celui qui voit le client partir avec son sac
 * est le seul à pouvoir l'attester. Le commerce en tire le sien — `fulfilled` —
 * et écrit à son tour `order.fulfilled`, que les points et le journal écoutent.
 *
 * Les deux classes portent encore le même nom ; leurs **types durables** ne le
 * peuvent pas (plan `documentation/journalisation/plan-evenements-durables.md`,
 * §3, « Homonymes ») : le `type` est la clé de routage, et un même nom pour
 * deux faits livrerait l'un aux abonnés de l'autre — ici, créditer des points
 * sur un retrait que le commerce n'a pas encore accepté.
 *
 * ## Fait DURABLE depuis le 2026-10-04 (lot E2)
 *
 * Il vivait en mémoire, « ni persisté ni rejoué » : un container qui tombait
 * entre l'attestation et l'écriture du commerce laissait la commande `ready`
 * avec un sac parti. Il s'écrit désormais dans la boîte d'envoi, dans la
 * transaction de l'attestation.
 *
 * ## Le contrat
 *
 * `{ orderId, rank, reference, handedOverAt, handedOverBy, via }` ; un fait
 * écrit avant `rank` se relit au rang 1. La **référence**
 * est ce que le commerce résout ; l'identifiant ne sert qu'à la clé. Le `via`
 * voyage parce que le commerce le recopie : sans lui, un retrait saisi
 * deviendrait un scan en traversant la frontière.
 *
 * ## La clé
 *
 * - Attestation : `handover.handed_over:<orderId>` — un envoi ne se retire
 *   qu'une fois (contrainte d'unicité de l'attestation) ; un reliquat a la
 *   sienne, `…:<orderId>:r<rang>` (plan E7 reliquat, choix 6 — la première
 *   annexe A l'oubliait, et la seconde remise aurait été avalée).
 * - Réannonce (un rescan refusé au comptoir, un rejeu à la porte) :
 *   `…:<orderId>:reannounced:<instant du geste>`, un fait NEUF par geste, comme
 *   le rescan du colisage. L'effet reste unique : le commerce ne refait rien
 *   sur une commande déjà retirée.
 *
 * 🔴 **Il vit dans le CANAL, pas dans le domaine** : un fait qu'un autre bloc
 * consomme fait partie de la surface publiée, au même titre qu'un port.
 */
export class OrderHandedOverEvent implements DurableEvent {
  constructor(
    /** L'identifiant opaque de la commande — la clé du fait, rien d'autre. */
    readonly orderId: string,
    /** Le rang de l'envoi retiré — 1 = la commande (plan E7 reliquat, choix 5). */
    readonly rank: number,
    /** La référence lisible, `ORD-1042`. */
    readonly reference: string,
    /** L'instant du retrait D'ORIGINE, jamais celui d'une réannonce. */
    readonly handedOverAt: Date,
    /** L'id de la fiche staff qui a constaté, figé. */
    readonly handedOverBy: string,
    /** `scan`, `manual` ou `deposit` — l'attestation forte ou l'honnête. */
    readonly via: HandoverVia,
    /** Présent sur une réannonce : l'instant du geste, pour la clé seulement. */
    readonly reannouncedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    const base = `${HANDOVER_HANDED_OVER}:${this.orderId}${shipmentKeySuffix(this.rank)}`;
    return {
      type: HANDOVER_HANDED_OVER,
      key:
        this.reannouncedAt === null
          ? base
          : `${base}:reannounced:${this.reannouncedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
        rank: this.rank,
        reference: this.reference,
        handedOverAt: this.handedOverAt.toISOString(),
        handedOverBy: this.handedOverBy,
        via: this.via,
      },
    };
  }

  /**
   * Relit le contrat côté abonné. Un payload hors forme est une faute
   * d'émetteur : la livraison échoue, est reprise, puis reste en message mort.
   *
   * @throws {OrderHandedOverPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderHandedOverEvent {
    const { orderId, reference, handedOverAt, handedOverBy, via } = payload;
    const at = typeof handedOverAt === "string" ? new Date(handedOverAt) : null;
    const knownVia = VIAS.find((candidate) => candidate === via);
    const rank = shipmentRankOf(payload["rank"]);
    if (
      typeof orderId !== "string" ||
      rank === null ||
      typeof reference !== "string" ||
      typeof handedOverBy !== "string" ||
      knownVia === undefined ||
      at === null ||
      Number.isNaN(at.getTime())
    ) {
      throw new OrderHandedOverPayloadError();
    }
    return new OrderHandedOverEvent(orderId, rank, reference, at, handedOverBy, knownVia);
  }
}

/** Le fait `handover.handed_over` reçu ne respecte pas son contrat. */
export class OrderHandedOverPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_handed_over.payload_invalid",
      "Le fait « commande retirée » reçu est illisible (commande, rang, référence, instant, auteur ou mode manquant) : " +
        "le commerce n'a pas clos la commande. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
