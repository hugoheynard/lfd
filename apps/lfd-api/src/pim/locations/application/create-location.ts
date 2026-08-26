import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../infra/id/pim-id-generator.js";
import { Location } from "../domain/entities/location.js";
import { LocationRepository } from "../domain/ports/location.repository.js";

export interface CreateLocationPayload {
  readonly name: string;
  readonly clickCollect: boolean;
  readonly surPlace: boolean;
  readonly baseUrl: string;
  readonly tableCount: number;
}

export class CreateLocationCommand {
  constructor(readonly payload: CreateLocationPayload) {}
}

@CommandHandler(CreateLocationCommand)
export class CreateLocationHandler implements ICommandHandler<CreateLocationCommand, string> {
  constructor(
    private readonly locations: LocationRepository,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateLocationCommand): Promise<string> {
    const { payload } = command;
    const id = this.ids.next();
    // Le nom exigé, l'URL trimée, la grille alignée — ou vide sans salle : tout
    // ça est décidé PAR l'agrégat, pas recomposé ici. L'unicité du nom, elle,
    // est tenue par `emplacement_name_unique` en base et traduite par le dépôt.
    const location = Location.open({ id, ...payload });
    // Le journal lit l'AGRÉGAT, pas la charge reçue. Deux écarts, sinon : un
    // nom entouré d'espaces s'y inscrivait tel quel alors que la base garde le
    // nom nettoyé ; et « 12 tables » demandées sans salle s'y inscrivaient
    // comme 12 alors que l'agrégat n'en ouvre aucune. Le journal doit dire ce
    // qui a été écrit, pas ce qui a été demandé.
    const created = location.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.locationCreated,
        subjectType: "location",
        subjectId: id,
        payload: {
          name: created.name,
          clickCollect: created.clickCollect,
          surPlace: created.surPlace,
          tableCount: created.tables.length,
        },
      });
      await this.locations.add(location, ticket);
    });
    return id;
  }
}
