import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";
import { RecordBatchCommand } from "./record-batch.command.js";

/**
 * **Une fournée est sortie.**
 *
 * Charger, demander à l'agrégat s'il laisse passer (journée arrêtée, SKU au
 * compte, au moins une pièce), écrire, comparer ce que la base a gardé.
 *
 * ## Pourquoi sans verrou
 *
 * Déclarer ne fait qu'AUGMENTER le disponible (D4) : aucun invariant « au bac ≤
 * sorti » ne peut casser. Et aucune colonne dérivée n'est écrite : deux
 * déclarations simultanées ne peuvent rien s'écraser, la somme est la seule
 * vérité.
 *
 * ## La coche héritée d'abord
 *
 * Une ligne cochée par l'ancien binaire se lit comme une fournée implicite tant
 * qu'aucune fournée réelle n'existe. La première fournée réelle l'effacerait :
 * on la matérialise donc avant (même `id` que le rattrapage, idempotent).
 *
 * ## La remise au colisage, dans la même unité de travail (2026-10-04)
 *
 * Sortir une fournée, c'est la remettre au colisage (plan
 * `colisage/colisage.md`, §11.2 ; §13, B3) : matérialiser,
 * déclarer, écrire la remise et publier `production.handed_to_packing` partent
 * ensemble. `handoffId` = l'`id` de la fournée — un rejeu est absorbé. Une
 * fournée rejouée APRÈS son annulation ne se remet pas : elle ne compte plus.
 * Les coches héritées matérialisées ne sont jamais remises.
 *
 * Rend `void` : le client relit la fiche — §4.
 *
 * @sans-journal geste d'atelier, sous le même régime que la coche (plan, D7) :
 * la dette du TODO `documentation/journalisation/todo-journal-activite.md`
 * s'en trouve élargie, et c'est dit.
 */
@CommandHandler(RecordBatchCommand)
export class RecordBatchHandler implements ICommandHandler<RecordBatchCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly handoffs: PackingHandoffs,
  ) {}

  async execute(command: RecordBatchCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const batch = current.batchToRecord(command.batchId, command.sku, command.quantity, {
      at: this.clock.now(),
      by: command.staffUserId,
      initials: command.initials,
    });
    await this.uow.run(async () => {
      for (const inherited of current.materialize(command.sku)) {
        await this.batches.record(day, inherited);
      }
      const stored = await this.batches.record(day, batch);
      current.acknowledge(batch, stored.serviceDay, stored.batch);
      if (stored.batch.cancelled === null) {
        await this.handoffs.handOver(day, stored.batch);
      }
    });
  }
}
