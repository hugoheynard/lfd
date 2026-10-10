import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../platform/id/uuid-generator.js";
import { Clock } from "../../platform/time/clock.js";
import { MediaSeries, type MediaSeriesDescription } from "../domain/entities/media-series.js";
import { MediaSeriesRepository } from "../domain/ports/media-series.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { parisToday } from "./series-today.js";

/** Ouvre une série de la médiathèque (L3, 2026-10-10). Rend son identifiant. */
export class DeclareMediaSeriesCommand {
  constructor(readonly description: MediaSeriesDescription) {}
}

/**
 * Ouvre une série : l'identifiant est assigné ICI (UUID v7), pas par la base,
 * et la commande ne rend que lui — l'écran relit la liste.
 */
@CommandHandler(DeclareMediaSeriesCommand)
export class DeclareMediaSeriesHandler implements ICommandHandler<
  DeclareMediaSeriesCommand,
  { readonly id: string }
> {
  constructor(
    private readonly series: MediaSeriesRepository,
    private readonly ids: UuidGenerator,
    private readonly clock: Clock,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeclareMediaSeriesCommand): Promise<{ readonly id: string }> {
    const series = MediaSeries.declare(
      this.ids.next(),
      command.description,
      parisToday(this.clock),
    );
    const { id, title, shotOn, note } = series.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: MEDIA_EVENTS.seriesCreated,
        subjectType: "media_series",
        subjectId: id,
        payload: { subjectLabel: title, title, shotOn, note },
      });
      await this.series.save(series, ticket);
    });
    return { id };
  }
}
