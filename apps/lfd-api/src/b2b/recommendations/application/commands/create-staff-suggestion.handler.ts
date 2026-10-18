import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionRule } from "../../domain/entities/staff-suggestion-rule.js";
import { StaffSuggestionCreatedEvent } from "../../domain/events/staff-suggestion.events.js";
import { AudienceSkuReader } from "../../domain/ports/audience-sku.reader.js";
import { StaffSuggestionRuleRepository } from "../../domain/ports/staff-suggestion-rule.repository.js";
import { SuggestionFamilyReader } from "../../domain/ports/suggestion-family.reader.js";
import { CreateStaffSuggestionCommand } from "./create-staff-suggestion.command.js";
import { ensureInCatalogue } from "./staff-suggestion-writing.js";

/**
 * **Crée** une suggestion décidée : l'agrégat juge la règle (et refuse une
 * fin déjà passée, au jour métier du `Clock`), le catalogue servi juge ce
 * qu'elle nomme, puis la règle et son fait partent ensemble.
 *
 * Rend l'id : il vient de l'`IdGenerator`, pas de la base.
 */
@CommandHandler(CreateStaffSuggestionCommand)
export class CreateStaffSuggestionHandler implements ICommandHandler<
  CreateStaffSuggestionCommand,
  string
> {
  constructor(
    private readonly rules: StaffSuggestionRuleRepository,
    private readonly skus: AudienceSkuReader,
    private readonly families: SuggestionFamilyReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CreateStaffSuggestionCommand): Promise<string> {
    const now = this.clock.now();
    const rule = StaffSuggestionRule.declare(
      this.ids.next(),
      command.rule,
      { by: command.writtenBy, at: now },
      instantToLocal(now).day,
    );
    const created = rule.snapshot();
    await ensureInCatalogue({ skus: this.skus, families: this.families }, created);

    await this.uow.run(async () => {
      await this.rules.add(rule);
      await this.events.publishTraced(new StaffSuggestionCreatedEvent(created));
    });
    return rule.id;
  }
}
