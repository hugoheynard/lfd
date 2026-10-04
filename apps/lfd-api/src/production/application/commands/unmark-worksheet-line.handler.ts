import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackingHandoffs } from "../services/packing-handoffs.service.js";
import { UnmarkWorksheetLineCommand } from "./unmark-worksheet-line.command.js";

/**
 * **La coche s'enlève** — l'ancienne case, traduite : toutes les fournées de
 * la ligne sont annulées (plan `plan-fournees-progressives.md`, D3).
 *
 * 🔴 **Elle peut désormais être refusée**, et c'est le seul changement de
 * comportement de l'ancien contrat : si des pièces de cet article sont dans
 * des sacs, décocher laisserait le colisage mentir. Le refus nomme le geste de
 * sortie — ressortir du bac d'abord.
 *
 * Sous le verrou de la journée (D4), pour la même raison qu'annuler une
 * fournée : le refus lit le bac, et un colisage validé entre la lecture et
 * l'écriture le rendrait faux.
 *
 * Les fournées déjà REMISES au colisage sont reprises dans la même unité de
 * travail (colisage, §13, B2) — cf. `CancelBatchHandler`.
 *
 * 🔴 **Sur une journée `packing` (K2), sa sémantique est « retour demandé »** :
 * les fournées remises deviennent des demandes de retour au colisage, la ligne
 * ne se vide PAS tout de suite, et la fiche dit « retour en attente ». Seule la
 * réponse du colisage fait baisser « sorti ». Le contrat de la route est servi
 * tel quel (204).
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(UnmarkWorksheetLineCommand)
export class UnmarkWorksheetLineHandler implements ICommandHandler<
  UnmarkWorksheetLineCommand,
  void
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly lock: ProductionDayLock,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly handoffs: PackingHandoffs,
  ) {}

  async execute(command: UnmarkWorksheetLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const cancelled = current.batchesToUncheck(command.sku);
      for (const inherited of current.materialize(command.sku)) {
        await this.batches.record(day, inherited);
      }
      const mark = { at: this.clock.now(), by: command.staffUserId };
      if (current.packingOwner === "packing") {
        for (const unhanded of await this.handoffs.requestReturns(day, cancelled, mark)) {
          await this.batches.cancel(day, unhanded.id, mark);
        }
        return;
      }
      for (const batch of cancelled) {
        await this.batches.cancel(day, batch.id, mark);
      }
      await this.handoffs.takeBack(day, cancelled, mark, current.packingOwner);
    });
  }
}
