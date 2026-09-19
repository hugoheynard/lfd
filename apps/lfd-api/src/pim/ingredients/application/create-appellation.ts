import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateAppellationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AppellationAggregate } from "../domain/entities/appellation.entity.js";
import { AppellationCodeTakenError } from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class CreateAppellationCommand {
  constructor(readonly payload: CreateAppellationPayload) {}
}

/**
 * Ouvre une appellation.
 *
 * Une **appellation neuve est en service** : on ne l'ouvre que pour s'en
 * servir, et la poser hors service demanderait un second geste pour rien.
 */
@CommandHandler(CreateAppellationCommand)
export class CreateAppellationHandler implements ICommandHandler<CreateAppellationCommand, string> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateAppellationCommand): Promise<string> {
    const appellation = AppellationAggregate.open({
      id: this.ids.next(),
      ...command.payload,
      active: true,
    });
    const created = appellation.snapshot();
    // L'agrégat NETTOIE le code ; on vérifie donc qu'il est libre sur la
    // version nettoyée, pas sur celle reçue. La base tranche en dernier.
    if ((await this.appellations.findByCode(created.code)) !== null) {
      throw new AppellationCodeTakenError(created.code);
    }

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.appellationCreated,
        subjectType: "appellation",
        subjectId: created.code,
        payload: { code: created.code, label: created.label, scheme: created.scheme },
      });
      await this.appellations.add(appellation, ticket);
    });
    return created.code;
  }
}
