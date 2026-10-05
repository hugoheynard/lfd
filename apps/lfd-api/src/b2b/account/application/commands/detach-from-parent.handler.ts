import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ParentDetachedEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { loadCompany, loadParentOf, named } from "../services/account-hierarchy-support.js";
import { DetachFromParentCommand } from "./detach-from-parent.command.js";

/**
 * Détache un sous-compte : ferme ses suivis en cours, PUIS retire le lien.
 * L'ordre compte — la base refuse une période en cours qui ne suit pas le
 * principal actuel (`company_follows_current_parent`).
 */
@CommandHandler(DetachFromParentCommand)
export class DetachFromParentHandler implements ICommandHandler<DetachFromParentCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DetachFromParentCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const child = await loadCompany(this.companies, command.companyId);
      const parent = await loadParentOf(this.companies, child);
      const follows = await this.follows.load(child.id);
      const closed = follows.closeAll(this.clock.now());
      await this.follows.save(follows);
      child.company.detachFromParent();
      await this.companies.save(child.company);
      await this.events.publishTraced(new ParentDetachedEvent(named(child), named(parent), closed));
    });
  }
}
