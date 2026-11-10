import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { AudienceEventBatch } from "../../domain/audience-event-batch.js";
import { UnknownAudienceSkuError } from "../../domain/errors/recommendation-errors.js";
import { AudienceCounterWriter } from "../../domain/ports/audience-counter.writer.js";
import { AudienceSkuReader } from "../../domain/ports/audience-sku.reader.js";
import { RecordProductAudienceCommand } from "./record-product-audience.command.js";

/**
 * Valide le lot (domaine), refuse un SKU que le catalogue ne sert à personne,
 * puis ajoute les compteurs du **jour métier** (Paris, lu au `Clock`).
 *
 * Un lot invalide est refusé ENTIER : compter la moitié d'un lot mal formé
 * rendrait les chiffres ininterprétables. L'écriture, elle, est best-effort
 * (cf. `AudienceCounterWriter`).
 */
@CommandHandler(RecordProductAudienceCommand)
export class RecordProductAudienceHandler implements ICommandHandler<
  RecordProductAudienceCommand,
  void
> {
  constructor(
    private readonly skus: AudienceSkuReader,
    private readonly counters: AudienceCounterWriter,
    private readonly clock: Clock,
  ) {}

  async execute(command: RecordProductAudienceCommand): Promise<void> {
    const batch = AudienceEventBatch.of(command.events);
    const served = await this.skus.servedAmong(batch.skus);
    const unknown = batch.skus.filter((sku) => !served.has(sku));
    if (unknown.length > 0) {
      throw new UnknownAudienceSkuError(unknown);
    }
    await this.counters.add(instantToLocal(this.clock.now()).day, batch.increments);
  }
}
