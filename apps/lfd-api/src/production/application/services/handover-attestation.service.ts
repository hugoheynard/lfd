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

    let handover: OrderHandover;
    try {
      // L'agrégat refuse ici — commande annulée, pas encore passée, déjà remise.
      handover = OrderHandover.attest(
        subject,
        existing === null ? null : existing.handedOverAt,
        at,
        by,
        via,
      );
    } catch (error) {
      // 🔴 **Le geste est refusé, la propagation est réparée.** Les deux ne sont
      // pas la même question : le sac est peut-être parti (rien à refaire), sans
      // que le commerce l'ait appris (tout à refaire). Le bus vit en processus
      // et n'est pas rejoué ; sans ceci, un abonné qui a échoué laissait la
      // commande en arrière **pour toujours**, et rescanner ne faisait que
      // répéter le refus.
      //
      // On republie donc l'attestation EXISTANTE, jamais la nôtre — l'heure et
      // l'auteur sont ceux de la vraie remise —, puis on laisse le refus partir
      // tel quel : c'est l'agrégat qui choisit le mot, et « annulée » explique
      // la situation mieux que « déjà remise » quand les deux sont vraies.
      this.republish(existing);
      throw error;
    }

    const won = await this.handovers.attest(handover);
    if (!won) {
      // Perdu la course : un autre poste a scanné, ou saisi, entre notre lecture
      // et notre écriture. On ne réécrit rien — l'attestation de l'autre est la
      // seule vraie, et elle est peut-être la FORTE —, mais on la RELIT pour la
      // réannoncer : le perdant est justement celui qui peut réparer.
      this.republish(await this.handovers.findByOrderId(subject.orderId));
      throw new HandoverRefusedError("Cette commande vient d'être remise à un autre poste.");
    }

    // Publié APRÈS l'écriture, et seulement par le GAGNANT : le perdant a levé
    // plus haut. Le commerce reçoit donc exactement un fait par remise, comme la
    // base en porte exactement une.
    this.events.publish(new OrderHandedOverEvent(handover.reference, at, by, via));

    return toHandoverView(subject, handover);
  }

  /**
   * Réannonce une attestation déjà gravée, ou ne fait rien s'il n'y en a pas.
   *
   * Sans danger, et c'est ce qui permet de l'appeler sur tous les chemins de
   * refus sans y réfléchir : `markFulfilled` est conditionné par
   * `handedOverAt: null` côté commerce, donc un fait rejoué qui a déjà été
   * traité n'écrit rien, ne journalise rien et ne fait partir aucun courriel.
   */
  private republish(handover: OrderHandover | null): void {
    if (handover === null) {
      return;
    }
    this.events.publish(
      new OrderHandedOverEvent(
        handover.reference,
        handover.handedOverAt,
        handover.handedOverBy,
        handover.via,
      ),
    );
  }
}
