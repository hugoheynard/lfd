import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { MarkWorksheetLineCommand } from "./mark-worksheet-line.command.js";

/**
 * **La ligne est faite** — l'ancienne case, traduite en fournée.
 *
 * Servie au même contrat tant qu'un front déployé l'appelle (CLAUDE.md §0).
 * Depuis les fournées (plan `plan-fournees-progressives.md`, D3), cocher veut
 * dire « rendre la ligne complète » : l'agrégat calcule le RESTE et le déclare
 * comme une fournée d'`id` déterministe. Elle n'écrit plus `done_*` (§5).
 *
 * - **Ligne déjà complète** : succès sans effet. Recocher passait, recocher
 *   passe — mais ne réécrit plus l'heure ni les initiales : la fournée qui a
 *   complété la ligne reste celle qui l'a complétée.
 * - **Deux cochers simultanés** calculent le même `id` ; le second est absorbé
 *   par l'idempotence de la déclaration.
 *
 * Les refus structurels (journée ouverte, SKU hors compte) restent ceux
 * d'`itemToMark`, appelés par `batchToComplete`.
 *
 * @sans-journal geste d'atelier, journalisation laissée au TODO par Hugo le
 * 2026-09-19 (une ligne par coche ou un fait par journée : à trancher —
 * `documentation/journalisation/todo-journal-activite.md`).
 */
@CommandHandler(MarkWorksheetLineCommand)
export class MarkWorksheetLineHandler implements ICommandHandler<MarkWorksheetLineCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: MarkWorksheetLineCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const batch = current.batchToComplete(command.sku, {
      at: this.clock.now(),
      by: command.staffUserId,
      initials: command.initials,
    });
    if (batch === null) {
      return;
    }
    for (const inherited of current.materialize(command.sku)) {
      await this.batches.record(day, inherited);
    }
    const stored = await this.batches.record(day, batch);
    current.acknowledge(batch, stored.serviceDay, stored.batch);
  }
}
