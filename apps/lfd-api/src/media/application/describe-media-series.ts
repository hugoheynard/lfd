import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { changesBetween } from "../../platform/journal/changes.js";
import { Clock } from "../../platform/time/clock.js";
import type {
  MediaSeriesDescription,
  MediaSeriesSnapshot,
} from "../domain/entities/media-series.js";
import { MediaSeriesNotFoundError } from "../domain/errors/media-series-errors.js";
import { MediaSeriesRepository } from "../domain/ports/media-series.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { parisToday } from "./series-today.js";

/** Corrige le titre, le jour de prise de vue et la note d'une série. */
export class DescribeMediaSeriesCommand {
  constructor(
    readonly id: string,
    readonly description: MediaSeriesDescription,
  ) {}
}

/**
 * Charge la série, la corrige par sa méthode métier, la range. Le diff part au
 * journal ; renvoyer les mêmes valeurs n'écrit aucun fait.
 */
@CommandHandler(DescribeMediaSeriesCommand)
export class DescribeMediaSeriesHandler implements ICommandHandler<
  DescribeMediaSeriesCommand,
  void
> {
  constructor(
    private readonly series: MediaSeriesRepository,
    private readonly clock: Clock,
    private readonly journal: MediaJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DescribeMediaSeriesCommand): Promise<void> {
    const series = await this.series.load(command.id);
    if (series === null) {
      throw new MediaSeriesNotFoundError(command.id);
    }
    const before = decisionsOf(series.snapshot());
    series.describe(command.description, parisToday(this.clock));
    const after = decisionsOf(series.snapshot());
    const changes = changesBetween(before, after);

    await this.uow.run(async () => {
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: MEDIA_EVENTS.seriesDescribed,
              subjectType: "media_series",
              subjectId: command.id,
              payload: { subjectLabel: after.title, changes },
            })
          : // L'écran renvoie les trois champs à chaque geste : rien n'a bougé.
            this.journal.untraced("aucune décision modifiée");
      await this.series.save(series, ticket);
    });
  }
}

/** Ce qui se décide d'une série — sans son identifiant, qui ne change pas. */
function decisionsOf(snapshot: MediaSeriesSnapshot): MediaSeriesDescription {
  return { title: snapshot.title, shotOn: snapshot.shotOn, note: snapshot.note };
}
