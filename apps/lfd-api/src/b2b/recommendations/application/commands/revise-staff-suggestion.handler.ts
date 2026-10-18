import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  journalRule,
  StaffSuggestionRevisedEvent,
} from "../../domain/events/staff-suggestion.events.js";
import { AudienceSkuReader } from "../../domain/ports/audience-sku.reader.js";
import { StaffSuggestionRuleRepository } from "../../domain/ports/staff-suggestion-rule.repository.js";
import { SuggestionFamilyReader } from "../../domain/ports/suggestion-family.reader.js";
import { SuggestionSiteReader } from "../../domain/ports/suggestion-site.reader.js";
import { ReviseStaffSuggestionCommand } from "./revise-staff-suggestion.command.js";
import { ensureInCatalogue, requireRule } from "./staff-suggestion-writing.js";

/**
 * **Réécrit** une suggestion. Le fait ne porte que ce qui a bougé ; une
 * réécriture qui ne change rien n'écrit rien. Le catalogue est rejugé :
 * réenregistrer une règle dont un article a été retiré du catalogue est
 * refusé, et c'est le moment de le remplacer.
 */
@CommandHandler(ReviseStaffSuggestionCommand)
export class ReviseStaffSuggestionHandler implements ICommandHandler<
  ReviseStaffSuggestionCommand,
  void
> {
  constructor(
    private readonly rules: StaffSuggestionRuleRepository,
    private readonly skus: AudienceSkuReader,
    private readonly families: SuggestionFamilyReader,
    private readonly sites: SuggestionSiteReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReviseStaffSuggestionCommand): Promise<void> {
    const rule = await requireRule(this.rules, command.id);
    const before = journalRule(rule.snapshot());
    rule.revise(command.rule, { by: command.writtenBy, at: this.clock.now() });
    const after = rule.snapshot();
    const changes = changesBetween(before, journalRule(after));
    if (Object.keys(changes).length === 0) {
      return;
    }
    await ensureInCatalogue({ skus: this.skus, families: this.families, sites: this.sites }, after);

    await this.uow.run(async () => {
      await this.rules.save(rule);
      await this.events.publishTraced(new StaffSuggestionRevisedEvent(after, changes));
    });
  }
}
