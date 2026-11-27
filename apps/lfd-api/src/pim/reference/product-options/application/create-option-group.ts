import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { OptionGroupPayload } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { UuidGenerator } from "../../../../platform/id/uuid-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { OptionGroup } from "../domain/entities/option-group.js";
import { OptionGroupRepository } from "../domain/ports/option-group.repository.js";
import { groupInputOf, journalStateOf } from "./option-group-support.js";

export class CreateOptionGroupCommand {
  constructor(
    readonly payload: OptionGroupPayload,
    readonly staffUserId: string,
    /** La clé que l'écran a fabriquée pour ce geste : un double clic n'ouvre pas deux groupes. */
    readonly intentKey: string,
  ) {}
}

/**
 * Crée un groupe d'options en service, une fois par intention : la clé est
 * scellée dans la transaction de l'écriture, et un rejeu rend l'identifiant
 * déjà créé. Le groupe ne vise encore aucune fiche : rien à réémettre.
 */
@CommandHandler(CreateOptionGroupCommand)
export class CreateOptionGroupHandler implements ICommandHandler<CreateOptionGroupCommand, string> {
  constructor(
    private readonly groups: OptionGroupRepository,
    @Inject(UuidGenerator) private readonly ids: UuidGenerator,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: CreateOptionGroupCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "pim.option_group.create",
        subject: intentSubject("option_group", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command.payload, seal),
    );
  }

  private async create(
    payload: OptionGroupPayload,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    const group = OptionGroup.open(this.ids.next(), groupInputOf(payload));
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.optionGroupCreated,
        subjectType: "option_group",
        subjectId: group.id,
        payload: journalStateOf(group),
      });
      await this.groups.add(group, ticket);
      await seal(group.id);
    });
    return group.id;
  }
}
