import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const PRODUCTION_ORDER_PACKED = "production.order_packed";

/**
 * **Le bac d'une commande est fait** — le colisage, constaté au fournil.
 *
 * ## Deux faits, pas un
 *
 * Celui-ci appartient à la PRODUCTION : c'est elle qui ferme le bac, et personne
 * d'autre ne peut le constater. Le commerce en tire le sien — `ready`, « prête
 * pour le client » — et publie à son tour `OrderReadyEvent`, que le journal et
 * le courriel écoutent déjà.
 *
 * Les nommer pareil aurait été une erreur : « colisé » dit ce qu'on a fait,
 * « prête » dit ce que le client peut attendre. Le jour où un colis fait n'est
 * pas encore remettable — un bac fermé qui attend le froid, par exemple —, les
 * deux se sépareront sans qu'on ait à renommer quoi que ce soit.
 *
 * ## Fait DURABLE depuis le 2026-10-04 (lot E1)
 *
 * Il vivait en mémoire, « ni persisté ni rejoué » : un container qui tombait
 * entre le colisage et l'écriture du commerce laissait la commande `confirmed`
 * alors que le bac était fait. Il s'écrit désormais dans la boîte d'envoi, dans
 * la transaction du colisage (plan
 * `documentation/journalisation/plan-evenements-durables.md`, E1).
 *
 * ## Le contrat
 *
 * `{ orderId, reference, packedAt, packedBy }` — aucune forme Prisma, aucun
 * montant, aucune ligne : le commerce a déjà tout ça. La **référence** est ce
 * que le commerce résout ; l'identifiant ne sert qu'à la clé. L'identité staff
 * vient du jeton du poste, jamais d'une charge utile.
 *
 * ## La clé
 *
 * - Colisage : `production.order_packed:<orderId>` — un bac ne se ferme qu'une
 *   fois (`packed_at IS NULL` arbitre en base), donc un fait par commande.
 * - Rescan d'un bac déjà fait : `…:<orderId>:reannounced:<instant du geste>`,
 *   un fait NEUF par pression, comme la réannonce de la clôture. C'est un geste
 *   humain de réparation — l'e2e `production-batch` « RATTRAPE un commerce resté
 *   en arrière » le tient — et le dédupliquer le rendrait muet. L'effet reste
 *   unique : l'abonné du commerce ne fait rien sur une commande déjà prête.
 *
 * 🔴 **Il vit dans le CANAL, pas dans le domaine** : un fait qu'un autre bloc
 * consomme fait partie de la surface publiée, au même titre qu'un port.
 */
export class OrderPackedEvent implements DurableEvent {
  constructor(
    /** L'identifiant opaque de la commande — la clé du fait, rien d'autre. */
    readonly orderId: string,
    /** La référence lisible, `ORD-…` — celle qui est écrite sur la feuille. */
    readonly reference: string,
    /** L'instant du colisage d'ORIGINE, jamais celui d'un rescan. */
    readonly packedAt: Date,
    /** L'id de la fiche staff qui a scanné, figé. */
    readonly packedBy: string,
    /** Présent sur un rescan : l'instant du geste, pour la clé seulement. */
    readonly reannouncedAt: Date | null = null,
  ) {}

  durableFact(): DurableFact {
    const base = `${PRODUCTION_ORDER_PACKED}:${this.orderId}`;
    return {
      type: PRODUCTION_ORDER_PACKED,
      key:
        this.reannouncedAt === null
          ? base
          : `${base}:reannounced:${this.reannouncedAt.toISOString()}`,
      payload: {
        orderId: this.orderId,
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
   * @throws {OrderPackedPayloadError}
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderPackedEvent {
    const { orderId, reference, packedAt, packedBy } = payload;
    const at = typeof packedAt === "string" ? new Date(packedAt) : null;
    if (
      typeof orderId !== "string" ||
      typeof reference !== "string" ||
      typeof packedBy !== "string" ||
      at === null ||
      Number.isNaN(at.getTime())
    ) {
      throw new OrderPackedPayloadError();
    }
    return new OrderPackedEvent(orderId, reference, at, packedBy);
  }
}

/** Le fait `production.order_packed` reçu ne respecte pas son contrat. */
export class OrderPackedPayloadError extends TechnicalError {
  constructor() {
    super(
      "order_packed.payload_invalid",
      "Le fait « bac fait » reçu est illisible (commande, référence, instant ou auteur manquant) : " +
        "le commerce n'a pas déclaré la commande prête. Le message reste dans la boîte d'envoi ; " +
        "corriger l'émetteur puis le rejouer depuis la carte de santé.",
    );
  }
}
