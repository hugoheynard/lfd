import type { ProductionPackingAck } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderPackedEvent } from "../../channels/commerce/order-packed.event.js";
import type { PackedMark } from "../../domain/entities/production-day.js";
import { OrderAlreadyPackedError } from "../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackOrderCommand } from "./pack-order.command.js";

/**
 * **Le bac est fait** — le colisage, constaté devant la fiche d'atelier.
 *
 * ## La réannonce, et pourquoi elle n'est pas un colisage de plus
 *
 * 🔴 Un second scan levait `409` jusqu'au 2026-09-08. C'était défendable et
 * c'était un piège : le bus vit **en processus**, l'événement n'est ni persisté
 * ni rejoué, et un abonné qui échoue laissait la commande en arrière chez le
 * commerce — `confirmed` pour toujours. Le refus fermait précisément le seul
 * geste qui répare, et rien ne signalait la divergence.
 *
 * Rescanner republie donc le fait **déjà gravé**. Ce n'est pas un second
 * colisage : l'attestation ne bouge pas — l'heure et l'auteur restent ceux du
 * premier scan, parce que c'est à ce moment-là que le bac a été fermé. Seul
 * l'événement repart, et il est sans danger parce que `markReady` est
 * idempotent (`readyAt: null` dans sa condition).
 *
 * C'est exactement le motif de la clôture, dont le dossier disait déjà :
 * « presser à nouveau le bouton est le rattrapage ».
 *
 * ⚠️ Les deux autres refus, eux, **restent** : une journée pas encore arrêtée et
 * une référence hors du plan ne sont pas des retards de propagation, ce sont des
 * gestes qui n'ont pas de sens. `sheetToPack` les porte, et les porte seul.
 */
@CommandHandler(PackOrderCommand)
export class PackOrderHandler implements ICommandHandler<PackOrderCommand, ProductionPackingAck> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: PackOrderCommand): Promise<ProductionPackingAck> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);

    // Lève si la journée n'est pas arrêtée ou si la référence est inconnue. Ne
    // dit rien du bac : c'est ici qu'on décide ce que « déjà fait » veut dire.
    const target = current.sheetToPack(command.reference);
    if (target.packed !== null) {
      return this.announce(command.reference, target.packed, true);
    }

    const at = this.clock.now();
    // La mutation en mémoire ne sert qu'à faire jouer les invariants : c'est
    // l'écriture conditionnée qui fait foi.
    current.pack(command.reference, at, command.staffSubject);

    const won = await this.days.markPacked(day, command.reference, at, command.staffSubject);
    if (!won) {
      // Course perdue entre la lecture et l'écriture. On ne réécrit rien — le
      // colisage de l'autre poste est le seul vrai —, mais on le RELIT pour le
      // réannoncer avec ses vraies valeurs. Publier les nôtres daterait le bac
      // d'un instant qui n'a rien fermé.
      return this.announce(command.reference, await this.winnerMark(day, command.reference), true);
    }

    return this.announce(command.reference, { at, by: command.staffSubject }, false);
  }

  /**
   * Le colisage tel qu'il est **en base** après une course perdue.
   *
   * Une relecture sur un chemin rare, et elle ne peut échouer que si la ligne a
   * disparu entre-temps — ce qu'aucun code ne fait, faute de suppression
   * physique. On refuse quand même plutôt que d'inventer un instant.
   */
  private async winnerMark(day: ServiceDay, reference: string): Promise<PackedMark> {
    const reloaded = await this.days.load(day);
    const mark = reloaded.sheetToPack(reference).packed;
    if (mark === null) {
      throw new OrderAlreadyPackedError(reference);
    }
    return mark;
  }

  /** Publie le fait — neuf ou rejoué — et rend l'accusé de réception. */
  private announce(
    reference: string,
    mark: PackedMark,
    alreadyPacked: boolean,
  ): ProductionPackingAck {
    this.events.publish(new OrderPackedEvent(reference, mark.at, mark.by));
    return {
      reference,
      packedAt: mark.at.toISOString(),
      packedBy: mark.by,
      alreadyPacked,
    };
  }
}
