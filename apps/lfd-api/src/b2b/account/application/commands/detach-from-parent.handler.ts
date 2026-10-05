import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ParentDetachedEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PricingFollowJournal } from "../../domain/ports/pricing-follow.journal.js";
import { SiteMandateRevocation } from "../../domain/ports/site-mandate-revocation.js";
import { loadCompany, loadParentOf, named } from "../services/account-hierarchy-support.js";
import { DetachFromParentCommand } from "./detach-from-parent.command.js";

/**
 * Détache un sous-compte : ferme ses suivis en cours, PUIS retire le lien.
 * L'ordre compte — la base refuse une période en cours qui ne suit pas le
 * principal actuel (`company_follows_current_parent`).
 *
 * Un site qui suivait `billing` voit révoquer, dans la même transaction, ses
 * mandats qui nomment le principal (plan-sous-comptes §2.1 ter, S4) : le
 * principal n'est plus son débiteur.
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
    private readonly pricingJournal: PricingFollowJournal,
    private readonly siteMandates: SiteMandateRevocation,
  ) {}

  async execute(command: DetachFromParentCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const child = await loadCompany(this.companies, command.companyId);
      const parent = await loadParentOf(this.companies, child);
      const follows = await this.follows.load(child.id);
      const now = this.clock.now();
      // Lue AVANT de fermer : l'acte de fin cite le début de la période.
      const pricing = follows.followsAt("pricing", now);
      const billing = follows.followsAt("billing", now);
      const closed = follows.closeAll(now);
      await this.follows.save(follows);
      child.company.detachFromParent();
      await this.companies.save(child.company);
      if (billing !== null) {
        await this.siteMandates.revokeNaming(child.id, billing.parentId, now);
      }
      await this.events.publishTraced(new ParentDetachedEvent(named(child), named(parent), closed));
      if (pricing !== null && closed.includes("pricing")) {
        await this.pricingJournal.followEnded({
          child: named(child),
          parent: named(parent),
          validFrom: pricing.validFrom,
          validTo: now,
        });
      }
    });
  }
}
