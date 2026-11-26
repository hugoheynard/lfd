import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ensureBillingFollowKeepsInHouse } from "../../domain/services/in-house-billing-follow.js";
import { ParentFollowedEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { InHousePayerReader } from "../../domain/ports/in-house-payer.reader.js";
import { PricingFollowJournal } from "../../domain/ports/pricing-follow.journal.js";
import { loadCompany, loadParentOf, named } from "../services/account-hierarchy-support.js";
import { FollowParentCommand } from "./follow-parent.command.js";

/**
 * Ouvre une période de suivi. Sous le verrou de la hiérarchie : le principal
 * relu est bien le principal actuel, et son statut (exigé actif pour
 * `billing`, §2.4) est celui du moment, comme la nature maison des deux
 * comptes (`restaurants-maison.md`).
 *
 * Idempotent : suivre ce qu'on suit déjà ne rouvre rien et ne s'inscrit pas.
 */
@CommandHandler(FollowParentCommand)
export class FollowParentHandler implements ICommandHandler<FollowParentCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly pricingJournal: PricingFollowJournal,
    private readonly inHouse: InHousePayerReader,
  ) {}

  async execute(command: FollowParentCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const child = await loadCompany(this.companies, command.companyId);
      const parent = await loadParentOf(this.companies, child);
      const follows = await this.follows.load(child.id);
      const now = this.clock.now();
      if (command.aspect === "billing") {
        // Un suivi `billing` relie deux comptes de même nature maison (D3).
        ensureBillingFollowKeepsInHouse({
          aspect: command.aspect,
          parentId: parent.id,
          childInHouse: await this.inHouse.isInHousePayer(child.id),
          parentInHouse: await this.inHouse.isInHousePayer(parent.id),
        });
      }
      if (!follows.follow(command.aspect, child.company, parent.company, now)) {
        return;
      }
      await this.follows.save(follows);
      // `pricing` s'inscrit au journal des prix, dont la copie générale tient
      // lieu de `company.parent_followed` (`sous-comptes.md`, S3).
      if (command.aspect === "pricing") {
        await this.pricingJournal.followStarted({
          child: named(child),
          parent: named(parent),
          validFrom: now,
        });
        return;
      }
      await this.events.publishTraced(
        new ParentFollowedEvent(named(child), named(parent), command.aspect, now),
      );
    });
  }
}
