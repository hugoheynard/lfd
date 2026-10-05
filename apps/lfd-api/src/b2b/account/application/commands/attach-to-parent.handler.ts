import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ParentAttachedEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { AttachToParentCommand } from "./attach-to-parent.command.js";

/**
 * Rattache un client à un principal. Verrou, puis relecture des DEUX
 * sociétés, puis l'agrégat tranche (§5) : deux rattachements croisés (A→B
 * pendant B→C, ou A→B pendant B→A) passent l'un après l'autre, et le second
 * voit le premier.
 *
 * Idempotent : rattacher au principal qu'on a déjà ne change rien et ne
 * s'inscrit pas au journal.
 */
@CommandHandler(AttachToParentCommand)
export class AttachToParentHandler implements ICommandHandler<AttachToParentCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AttachToParentCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const child = await loadCompany(this.companies, command.companyId);
      const parent = await loadCompany(this.companies, command.parentId);
      const alreadyThere = child.company.parentCompanyId === parent.id;
      child.company.attachTo(parent.company);
      if (alreadyThere) {
        return;
      }
      await this.companies.save(child.company);
      await this.events.publishTraced(
        new ParentAttachedEvent(named(child), named(parent), "attached"),
      );
    });
  }
}
