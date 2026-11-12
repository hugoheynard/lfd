import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../platform/id/uuid-generator.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../platform/intent/once-per-intent.js";
import { Clock } from "../../platform/time/clock.js";
import { MediaSeries, type MediaSeriesDescription } from "../domain/entities/media-series.js";
import { MediaSeriesRepository } from "../domain/ports/media-series.js";
import { MEDIA_EVENTS, MediaJournal } from "../journal/media-journal.js";
import { parisToday } from "./series-today.js";

/**
 * Ouvre une série de la médiathèque (2026-10-10). Rend son identifiant.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * n'ouvre qu'une série.
 */
export class DeclareMediaSeriesCommand {
  constructor(
    readonly description: MediaSeriesDescription,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}

/**
 * Ouvre une série : l'identifiant est assigné ICI (UUID v7), pas par la base,
 * et la commande ne rend que lui — l'écran relit la liste.
 *
 * **Une fois par intention** : rien ne distingue deux séries décrites pareil,
 * la clé de l'écran est scellée avec l'ouverture ; un rejeu de la même clé
 * rend la même série.
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
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: DeclareMediaSeriesCommand): Promise<{ readonly id: string }> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "media.series.declare",
        subject: "new",
      },
      SERIES_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private async declare(
    command: DeclareMediaSeriesCommand,
    seal: (result: { readonly id: string }) => Promise<void>,
  ): Promise<{ readonly id: string }> {
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
      await seal({ id });
    });
    return { id };
  }
}

/** L'identifiant de la série ouverte, rendu tel quel au rejeu. */
const SERIES_REPLAY: IntentCodec<{ readonly id: string }> = {
  write: (result) => ({ id: result.id }),
  read: (record, gesture) => ({ id: readIntentString(record, "id", gesture) }),
};
