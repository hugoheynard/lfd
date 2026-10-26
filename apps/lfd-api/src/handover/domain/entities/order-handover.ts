import { FIRST_SHIPMENT_RANK, ShipmentRef } from "../../../production/channels/handover/index.js";
import { HandoverRefusedError } from "../errors/handover-errors.js";
import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { handoverBlocker, type HandoverVia } from "../services/handover.js";

/** Ce que la règle lit d'une commande et que le commerce ne porte pas. */
export interface HandoverStanding {
  /** L'attestation déjà gravée, ou `null`. */
  readonly handedOverAt: Date | null;
  /** Retenue par un contrôle qualité, selon la production. */
  readonly qualityHold: boolean;
}

/**
 * **L'attestation de retrait** — le fait que le fournil grave, et son gardien.
 *
 * ## Pourquoi un agrégat, alors que c'est une ligne à cinq colonnes
 *
 * Parce qu'une règle peut refuser cette écriture : la commande est annulée, elle
 * n'est pas passée, elle a déjà été retirée, elle est retenue au contrôle. Le critère de tri du dossier est
 * exactement celui-là — « existe-t-il une règle qui peut refuser cette
 * écriture ? » —, et il dit agrégat.
 *
 * L'alternative aurait été un `repo.attest(orderId, at, by, via)` prenant des
 * primitives, avec les trois refus dans le handler. Ils y seraient invisibles au
 * prochain handler qui touche le même fait — et il y en a déjà **deux**, le scan
 * et la saisie.
 *
 * ## Ce que la factory garantit, et ce que la base garantit
 *
 * Elle refuse un état qui interdit le geste, et une identité vide — « une preuve
 * sans auteur n'est pas une preuve ». Elle ne peut pas garantir l'unicité : deux
 * postes qui scannent au même instant construisent chacun leur attestation, et
 * seule la base peut trancher. C'est son travail, et elle l'a par contrainte
 * plutôt que par condition — cf. `order_handover`.
 */
export class OrderHandover {
  private constructor(
    readonly orderId: string,
    /**
     * Le rang de l'envoi retiré — 1 = la commande (plan E7 reliquat, choix 5,
     * lot L3d) ; au-delà, un reliquat, retiré pour lui-même (lot L4b).
     */
    readonly rank: number,
    readonly reference: string,
    readonly handedOverAt: Date,
    readonly handedOverBy: string,
    readonly via: HandoverVia,
  ) {}

  /**
   * Atteste le retrait de l'envoi `(commande, rang)`, ou **refuse en nommant
   * l'empêchement**.
   *
   * Par envoi depuis le lot L4b (plan E7 reliquat) : `standing.handedOverAt`
   * est celui de CET envoi, donc « déjà retiré » se juge envoi par envoi, et
   * la référence gravée porte `-<rang>` au-delà du rang 1 — le rang 1 garde le
   * numéro de commande, à l'identique.
   *
   * `standing` porte ce que le sujet ne sait pas : `handedOverAt` vient de la
   * table du retrait — le commerce n'est plus l'autorité sur ce fait, et le lui
   * demander rouvrirait la porte aux deux vérités —, `qualityHold` de la
   * production (`plan-controle-qualite.md`, D4). Les deux passent par la même
   * règle, dans l'ordre qu'elle fixe.
   *
   * @throws {HandoverRefusedError} l'état interdit le retrait, ou l'auteur manque.
   */
  static attest(
    subject: HandoverSubject,
    rank: number,
    standing: HandoverStanding,
    at: Date,
    by: string,
    via: HandoverVia,
  ): OrderHandover {
    // Refuse un rang hors forme avant toute règle : un envoi de rang 0 n'existe pas.
    const shipment = ShipmentRef.of(subject.orderId, rank);
    const blocker = handoverBlocker({
      status: subject.status,
      rank: shipment.rank,
      handedOverAt: standing.handedOverAt,
      qualityHold: standing.qualityHold,
      settled: subject.settled,
    });
    if (blocker !== null) {
      throw new HandoverRefusedError(blocker);
    }
    if (by === "") {
      // Le contrôleur refuse déjà une session sans sujet. On le refuse ici
      // aussi : le jour où un second appelant existera, il ne pourra pas graver
      // une attestation anonyme en ayant simplement oublié cette garde-là.
      throw new HandoverRefusedError("Un retrait sans auteur n'est pas une attestation.");
    }
    return new OrderHandover(
      shipment.orderId,
      shipment.rank,
      shipmentReference(subject.orderNumber, shipment.rank),
      at,
      by,
      via,
    );
  }

  /**
   * Réhydrate une attestation **déjà gravée**, sans repasser par la règle.
   *
   * Elle ne la repasse pas volontairement : la règle dit ce qu'on a le droit de
   * FAIRE, pas ce qui a eu lieu. Une commande annulée après son retrait ne doit
   * pas rendre illisible l'attestation qui prouve qu'elle est partie — c'est
   * précisément le jour où on va la relire.
   */
  static rehydrate(
    orderId: string,
    reference: string,
    handedOverAt: Date,
    handedOverBy: string,
    via: HandoverVia,
    rank: number = FIRST_SHIPMENT_RANK,
  ): OrderHandover {
    return new OrderHandover(orderId, rank, reference, handedOverAt, handedOverBy, via);
  }

  /** L'envoi retiré. */
  get shipment(): ShipmentRef {
    return ShipmentRef.of(this.orderId, this.rank);
  }
}

/**
 * La référence gravée d'un envoi : le numéro de commande au rang 1, à
 * l'identique (rien de ce qui est déjà en base ne change), suffixé `-<rang>`
 * au-delà (plan E7 reliquat, choix 13). `order_handover.reference` est unique
 * sur toute la table : sans suffixe, le reliquat heurterait le rang 1.
 */
export function shipmentReference(orderNumber: string, rank: number): string {
  return rank === FIRST_SHIPMENT_RANK ? orderNumber : `${orderNumber}-${String(rank)}`;
}
