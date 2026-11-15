import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductionBatchRepository } from "../../../day/index.js";
import { ProductionDayLock } from "../../../day/index.js";
import { ProductionDayRepository } from "../../../day/index.js";
import { ServiceDay } from "../../../day/index.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";
import { RecordBatchCommand } from "./record-batch.command.js";

/**
 * **Une fournée est sortie.**
 *
 * Charger, demander à l'agrégat s'il laisse passer (journée arrêtée, SKU au
 * compte, au moins une pièce), écrire, comparer ce que la base a gardé.
 *
 * ## Sous le verrou de la journée (audit du réassort, 2026-11-02)
 *
 * Déclarer ne fait qu'AUGMENTER ce qui est sorti du four (décision D4 du plan
 * des fournées) : aucun invariant « au bac ≤ sorti » ne peut casser, et deux
 * déclarations simultanées ne s'écrasent rien.
 * Mais la GARDE de l'agrégat (journée arrêtée, SKU au compte) se lisait sur
 * une journée chargée hors verrou : une réouverture ou un retirage passés
 * entre la lecture et l'écriture laissaient entrer une fournée sur une
 * journée rouverte, ou un SKU sorti du compte. Le geste prend donc le verrou
 * de la journée, la RECHARGE, puis demande à l'agrégat — comme l'annulation.
 *
 * ## La remise au colisage, dans la même unité de travail (2026-10-04)
 *
 * Sortir une fournée, c'est la remettre au colisage (plan
 * `colisage/colisage.md`, §11.2 ; §13, B3) : déclarer, écrire la remise et publier `production.handed_to_packing` partent
 * ensemble. `handoffId` = l'`id` de la fournée — un rejeu est absorbé. Une
 * fournée rejouée APRÈS son annulation ne se remet pas : elle ne compte plus.
 *
 * Rend `void` : le client relit la fiche — §4.
 *
 * @sans-journal geste d'atelier (plan, D7) : la dette du TODO `documentation/journalisation/todo-journal-activite.md`
 * s'en trouve élargie, et c'est dit.
 */
@CommandHandler(RecordBatchCommand)
export class RecordBatchHandler implements ICommandHandler<RecordBatchCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly lock: ProductionDayLock,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly handoffs: PackingHandoffs,
  ) {}

  async execute(command: RecordBatchCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const batch = current.batchToRecord(command.batchId, command.sku, command.quantity, {
        at: this.clock.now(),
        by: command.staffUserId,
        initials: command.initials,
      });
      const stored = await this.batches.record(day, batch);
      current.acknowledge(batch, stored.serviceDay, stored.batch);
      if (stored.batch.cancelled === null) {
        await this.handoffs.handOver(day, current, stored.batch);
      }
    });
  }
}
