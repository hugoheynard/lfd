import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionArchivedEvent } from "../../domain/events/staff-suggestion.events.js";
import { StaffSuggestionRuleRepository } from "../../domain/ports/staff-suggestion-rule.repository.js";
import { ArchiveStaffSuggestionCommand } from "./archive-staff-suggestion.command.js";
import { requireRule } from "./staff-suggestion-writing.js";

/** **Archive** une suggestion. Pas de suppression physique : l'instant du geste devient sa date de retrait. */
@CommandHandler(ArchiveStaffSuggestionCommand)
export class ArchiveStaffSuggestionHandler implements ICommandHandler<
  ArchiveStaffSuggestionCommand,
  void
> {
  constructor(
    private readonly rules: StaffSuggestionRuleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveStaffSuggestionCommand): Promise<void> {
    const rule = await requireRule(this.rules, command.id);
    rule.archive({ by: command.writtenBy, at: this.clock.now() });
    await this.uow.run(async () => {
      await this.rules.save(rule);
      await this.events.publishTraced(new StaffSuggestionArchivedEvent(rule.snapshot()));
    });
  }
}
