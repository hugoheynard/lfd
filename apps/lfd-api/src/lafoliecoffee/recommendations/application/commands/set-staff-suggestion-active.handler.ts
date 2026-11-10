import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionActivityChangedEvent } from "../../domain/events/staff-suggestion.events.js";
import { StaffSuggestionRuleRepository } from "../../domain/ports/staff-suggestion-rule.repository.js";
import { SetStaffSuggestionActiveCommand } from "./set-staff-suggestion-active.command.js";
import { requireRule } from "./staff-suggestion-writing.js";

/**
 * **Coupe ou rallume** une suggestion. Un geste sans effet (déjà dans cet
 * état) n'écrit rien et ne dit rien au journal. Le catalogue n'est pas
 * rejugé : rallumer une règle dont un article est sorti du catalogue la
 * laisse inerte à l'affichage (le filtre de R0 l'écarte), sans la refuser.
 */
@CommandHandler(SetStaffSuggestionActiveCommand)
export class SetStaffSuggestionActiveHandler implements ICommandHandler<
  SetStaffSuggestionActiveCommand,
  void
> {
  constructor(
    private readonly rules: StaffSuggestionRuleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetStaffSuggestionActiveCommand): Promise<void> {
    const rule = await requireRule(this.rules, command.id);
    const changed = rule.setActive(command.active, {
      by: command.writtenBy,
      at: this.clock.now(),
    });
    if (!changed) {
      return;
    }
    await this.uow.run(async () => {
      await this.rules.save(rule);
      await this.events.publishTraced(new StaffSuggestionActivityChangedEvent(rule.snapshot()));
    });
  }
}
