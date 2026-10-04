import type { ProductionPackingAck } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderPackedEvent } from "../../channels/commerce/order-packed.event.js";
import type { PackedMark } from "../../domain/entities/production-day.js";
import type { ProductionOrderSnapshot } from "../../domain/entities/production-day.snapshot.js";
import { OrderAlreadyPackedError } from "../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackOrderCommand } from "./pack-order.command.js";

/**
 * **Le bac est fait** — le colisage, constaté devant la fiche d'atelier.
 *
 * ## Le colisage et son fait, dans la MÊME transaction (depuis le 2026-10-04)
 *
 * `markPacked` et l'écriture de `production.order_packed` dans la boîte
 * d'envoi partent dans une seule unité de travail : les deux, ou aucun. Le fait
 * n'est écrit que si CE poste gagne l'écriture conditionnée — le perdant d'une
 * course n'écrit rien, le fait du gagnant suffit (plan
 * `documentation/journalisation/plan-evenements-durables.md`, E1). Plus rien ne
 * part sur le bus en mémoire : le seul abonné (`OnOrderPacked`, commerce) est
 * durable.
 *
 * ## Le rescan, et pourquoi il n'est pas un colisage de plus
 *
 * 🔴 Un second scan levait `409` jusqu'au 2026-09-08 : le fait vivait en
 * mémoire, et le refus fermait le seul geste qui réparait un abonné perdu.
 * Rescanner republie donc le fait **déjà gravé** — l'heure et l'auteur restent
 * ceux du premier scan — sous une clé NEUVE, un fait par pression, comme la
 * réannonce de la clôture. La boîte d'envoi reprend désormais un abonné qui
 * échoue ; le rescan reste le filet humain, notamment pour un bac colisé avant
 * le 2026-10-04 dont le fait en mémoire s'est perdu (aucune ligne à rejouer).
 * Sans danger : le commerce ne fait rien sur une commande déjà prête.
 *
 * ⚠️ Les deux autres refus, eux, **restent** : une journée pas encore arrêtée et
 * une référence hors du plan ne sont pas des retards de propagation, ce sont des
 * gestes qui n'ont pas de sens. `sheetToPack` les porte, et les porte seul.
 *
 * @sans-journal le colisage rend la commande prête chez le commerce
 * (`OnOrderPacked` → `MarkOrderReadyCommand`), et `order.ready` est écrit par
 * l'abonné de la croissance (`on-order-ready.handler.ts`), en best-effort comme
 * les autres faits de commande — choix écrit du plan du journal, lot 1, et TODO
 * « Les faits écrits par un abonné ne sont pas opposables » (2026-09-19). Un
 * second fait ici doublerait l'écrivain d'`order.ready`.
 */
@CommandHandler(PackOrderCommand)
export class PackOrderHandler implements ICommandHandler<PackOrderCommand, ProductionPackingAck> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: PackOrderCommand): Promise<ProductionPackingAck> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);

    // Lève si la journée n'est pas arrêtée ou si la référence est inconnue. Ne
    // dit rien du bac : c'est ici qu'on décide ce que « déjà fait » veut dire.
    const target = current.sheetToPack(command.reference);
    if (target.packed !== null) {
      return this.reannounce(target, target.packed);
    }

    const at = this.clock.now();
    // La mutation en mémoire ne sert qu'à faire jouer les invariants : c'est
    // l'écriture conditionnée qui fait foi.
    current.pack(command.reference, at, command.staffUserId);
    const mark: PackedMark = { at, by: command.staffUserId };

    const won = await this.uow.run(async () => {
      const wrote = await this.days.markPacked(day, command.reference, at, command.staffUserId);
      if (wrote) {
        await this.durable.publish(this.factOf(target, mark, null).durableFact());
      }
      return wrote;
    });
    if (!won) {
      // Course perdue entre la lecture et l'écriture. On ne réécrit rien et on
      // ne publie rien — le colisage de l'autre poste est le seul vrai, et son
      // fait est parti avec lui. On le RELIT pour répondre avec ses valeurs.
      return ack(command.reference, await this.winnerMark(day, command.reference), true);
    }
    return ack(command.reference, mark, false);
  }

  /** Republie le fait d'un bac déjà fait, sous une clé neuve, sans rien réécrire. */
  private async reannounce(
    target: ProductionOrderSnapshot,
    mark: PackedMark,
  ): Promise<ProductionPackingAck> {
    const now = this.clock.now();
    await this.uow.run(() => this.durable.publish(this.factOf(target, mark, now).durableFact()));
    return ack(target.reference, mark, true);
  }

  /** L'instant et l'auteur sont ceux du COLISAGE, jamais ceux du rescan. */
  private factOf(
    target: ProductionOrderSnapshot,
    mark: PackedMark,
    reannouncedAt: Date | null,
  ): OrderPackedEvent {
    return new OrderPackedEvent(target.orderId, target.reference, mark.at, mark.by, reannouncedAt);
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
}

/** L'accusé de réception du poste. */
function ack(reference: string, mark: PackedMark, alreadyPacked: boolean): ProductionPackingAck {
  return {
    reference,
    packedAt: mark.at.toISOString(),
    packedBy: mark.by,
    alreadyPacked,
  };
}
