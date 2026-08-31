import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { CreateAppellationPayload, UpdateAppellationPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { changesBetween } from "../../journal/changes.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import {
  AppellationAggregate,
  type AppellationSnapshot,
} from "../domain/entities/appellation.entity.js";
import {
  AppellationCodeTakenError,
  AppellationNotFoundError,
} from "../domain/errors/ingredient-errors.js";
import { AppellationRepository } from "../domain/ports/appellation.repository.js";

export class CreateAppellationCommand {
  constructor(readonly payload: CreateAppellationPayload) {}
}

export class UpdateAppellationCommand {
  constructor(
    readonly code: string,
    readonly payload: UpdateAppellationPayload,
  ) {}
}

export class RemoveAppellationCommand {
  constructor(readonly code: string) {}
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

/** Règle une appellation — tout sauf son code. */
@CommandHandler(UpdateAppellationCommand)
export class UpdateAppellationHandler implements ICommandHandler<UpdateAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateAppellationCommand): Promise<void> {
    const { code, payload } = command;
    const appellation = await this.appellations.findByCode(code);
    if (appellation === null) {
      throw new AppellationNotFoundError(code);
    }
    const before = traced(appellation.snapshot());
    appellation.revise(payload);
    const changes = changesBetween(before, traced(appellation.snapshot()));

    await this.uow.run(async () => {
      // L'écran renvoie la fiche entière à chaque enregistrement : sans ce
      // filtre, l'historique serait surtout fait de gestes sans effet.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.appellationUpdated,
              subjectType: "appellation",
              subjectId: code,
              payload: { changes },
            })
          : this.journal.untraced("record without modification");
      await this.appellations.save(appellation, ticket);
    });
  }
}

/**
 * Efface une appellation.
 *
 * Le refus « encore citée » n'est PAS vérifié ici : la clé étrangère le tient,
 * et un compte préalable laisserait l'intervalle entre le compte et l'ordre.
 */
@CommandHandler(RemoveAppellationCommand)
export class RemoveAppellationHandler implements ICommandHandler<RemoveAppellationCommand, void> {
  constructor(
    private readonly appellations: AppellationRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveAppellationCommand): Promise<void> {
    const { code } = command;
    const appellation = await this.appellations.findByCode(code);
    if (appellation === null) {
      throw new AppellationNotFoundError(code);
    }
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.appellationDeleted,
        subjectType: "appellation",
        subjectId: code,
        payload: { label: appellation.snapshot().label },
      });
      await this.appellations.remove(code, ticket);
    });
  }
}

/** Ce que le journal retient. Le code n'y est pas : il EST le sujet du fait. */
function traced(snapshot: AppellationSnapshot): Record<string, unknown> {
  const { label, scheme, active } = snapshot;
  return { label, scheme, active };
}
