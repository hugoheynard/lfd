import { HandoverRefusedError } from "../errors/production-errors.js";
import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { handoverBlocker, type HandoverVia } from "../services/handover.js";

/**
 * **L'attestation de remise** — le fait que le fournil grave, et son gardien.
 *
 * ## Pourquoi un agrégat, alors que c'est une ligne à cinq colonnes
 *
 * Parce qu'une règle peut refuser cette écriture : la commande est annulée, elle
 * n'est pas passée, elle a déjà été remise. Le critère de tri du dossier est
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
    readonly reference: string,
    readonly handedOverAt: Date,
    readonly handedOverBy: string,
    readonly via: HandoverVia,
  ) {}

  /**
   * Atteste la remise de cette commande, ou **refuse en nommant l'empêchement**.
   *
   * `alreadyHandedOver` vient de la table du fournil, pas du sujet : le commerce
   * n'est plus l'autorité sur ce fait, et le lui demander rouvrirait la porte
   * aux deux vérités.
   *
   * @throws {HandoverRefusedError} l'état interdit la remise, ou l'auteur manque.
   */
  static attest(
    subject: HandoverSubject,
    alreadyHandedOver: Date | null,
    at: Date,
    by: string,
    via: HandoverVia,
  ): OrderHandover {
    const blocker = handoverBlocker({ status: subject.status, handedOverAt: alreadyHandedOver });
    if (blocker !== null) {
      throw new HandoverRefusedError(blocker);
    }
    if (by === "") {
      // Le contrôleur refuse déjà une session sans sujet. On le refuse ici
      // aussi : le jour où un second appelant existera, il ne pourra pas graver
      // une attestation anonyme en ayant simplement oublié cette garde-là.
      throw new HandoverRefusedError("Une remise sans auteur n'est pas une attestation.");
    }
    return new OrderHandover(subject.orderId, subject.orderNumber, at, by, via);
  }

  /**
   * Réhydrate une attestation **déjà gravée**, sans repasser par la règle.
   *
   * Elle ne la repasse pas volontairement : la règle dit ce qu'on a le droit de
   * FAIRE, pas ce qui a eu lieu. Une commande annulée après sa remise ne doit
   * pas rendre illisible l'attestation qui prouve qu'elle est partie — c'est
   * précisément le jour où on va la relire.
   */
  static rehydrate(
    orderId: string,
    reference: string,
    handedOverAt: Date,
    handedOverBy: string,
    via: HandoverVia,
  ): OrderHandover {
    return new OrderHandover(orderId, reference, handedOverAt, handedOverBy, via);
  }
}
