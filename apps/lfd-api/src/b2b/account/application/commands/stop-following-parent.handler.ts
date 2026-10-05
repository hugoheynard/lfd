import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ParentUnfollowedEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { StopFollowingParentCommand } from "./stop-following-parent.command.js";

/**
 * Ferme la période de suivi en cours. Idempotent : cesser de suivre ce qu'on
 * ne suit pas ne change rien et ne s'inscrit pas.
 *
 * ⚠️ Cesser de suivre `billing` ne change PAS le statut au lot S1 : le plan
 * (§2.1 bis) veut un passage `pending` « s'il n'a ni SIRET ni RIB », et ce
 * critère n'est pas tranché (cf. le rapport du lot). La fiche, elle, montre
 * aussitôt l'identité légale manquante.
 */
@CommandHandler(StopFollowingParentCommand)
export class StopFollowingParentHandler implements ICommandHandler<
  StopFollowingParentCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: StopFollowingParentCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const child = await loadCompany(this.companies, command.companyId);
      const follows = await this.follows.load(child.id);
      const now = this.clock.now();
      const closed = follows.stopFollowing(command.aspect, now);
      if (closed === null) {
        return;
      }
      await this.follows.save(follows);
      // Le principal d'ALORS, figé dans la période — pas forcément l'actuel.
      const parent = await loadCompany(this.companies, closed.parentId);
      await this.events.publishTraced(
        new ParentUnfollowedEvent(named(child), named(parent), command.aspect, now),
      );
    });
  }
}
