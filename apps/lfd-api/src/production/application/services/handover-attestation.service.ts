import type { OrderHandoverView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import type { HandoverSubject } from "../../channels/commerce/handover-subject.reader.js";
import { OrderHandedOverEvent } from "../../channels/commerce/order-handed-over.event.js";
import { OrderHandover } from "../../domain/entities/order-handover.js";
import { HandoverRefusedError } from "../../domain/errors/production-errors.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import type { HandoverVia } from "../../domain/services/handover.js";
import { toHandoverView } from "../queries/get-handover.handler.js";

/**
 * **Graver une remise** — le geste commun au scan et à la saisie.
 *
 * ## Pourquoi un service, et pas deux handlers qui se ressemblent
 *
 * Ce qui distingue les deux portes tient en un mot : `scan` ou `manual`. Tout le
 * reste est identique — la même règle d'état, le même arbitrage de course, le
 * même fait publié, la même identité prise sur la session.
 *
 * La version précédente, chez le commerce, dupliquait ce corps dans les deux
 * handlers, et son propre JSDoc nommait le risque : « c'est ce qui évite qu'un
 * champ ajouté un jour ne soit posé que d'un côté ». Le déménagement est le bon
 * moment pour cesser de compter sur la vigilance.
 *
 * Chaque handler garde donc **sa** responsabilité — résoudre le sujet, par jeton
 * ou par numéro, et refuser si le sujet n'existe pas —, et délègue le reste.
 */
@Injectable()
export class HandoverAttestation {
  constructor(
    private readonly handovers: OrderHandoverRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  /**
   * Atteste, publie, et rend l'attestation obtenue.
   *
   * Rendre une vue depuis une écriture est assumé, comme au comptoir d'avant :
   * la confirmation doit s'afficher dans la seconde où le client attend son sac,
   * sans un second aller-retour. Ce n'est pas un modèle de lecture déguisé —
   * c'est l'accusé de réception de l'écriture.
   *
   * @throws {HandoverRefusedError} l'état l'interdit, ou un autre poste a gagné.
   */
  async attest(subject: HandoverSubject, by: string, via: HandoverVia): Promise<OrderHandoverView> {
    const existing = await this.handovers.findByOrderId(subject.orderId);
    const at = this.clock.now();

    // L'agrégat refuse ici — commande annulée, pas encore passée, déjà remise.
    const handover = OrderHandover.attest(
      subject,
      existing === null ? null : existing.handedOverAt,
      at,
      by,
      via,
    );

    const won = await this.handovers.attest(handover);
    if (!won) {
      // Perdu la course : un autre poste a scanné, ou saisi, entre notre lecture
      // et notre écriture. On ne réécrit rien — l'attestation de l'autre est la
      // seule vraie, et elle est peut-être la FORTE.
      throw new HandoverRefusedError("Cette commande vient d'être remise à un autre poste.");
    }

    // Publié APRÈS l'écriture, et seulement par le GAGNANT : le perdant a levé
    // plus haut. Le commerce reçoit donc exactement un fait par remise, comme la
    // base en porte exactement une.
    this.events.publish(new OrderHandedOverEvent(handover.reference, at, by, via));

    return toHandoverView(subject, handover);
  }
}
