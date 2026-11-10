import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { GroupWithoutDeliverySetEvent } from "../../domain/events/hierarchy-acts.event.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { SetGroupWithoutDeliveryCommand } from "./set-group-without-delivery.command.js";

/**
 * Pose la case « Compte de groupe, sans livraison ». Sous le verrou de la
 * hiérarchie, parce que le rattachement la lit : un compte de groupe ne
 * devient pas sous-compte, et les deux gestes ne doivent pas se croiser.
 *
 * Idempotent : reposer la même valeur ne s'inscrit pas.
 */
@CommandHandler(SetGroupWithoutDeliveryCommand)
export class SetGroupWithoutDeliveryHandler implements ICommandHandler<
  SetGroupWithoutDeliveryCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetGroupWithoutDeliveryCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const loaded = await loadCompany(this.companies, command.companyId);
      if (loaded.company.hierarchy.groupWithoutDelivery === command.enabled) {
        return;
      }
      loaded.company.markGroupWithoutDelivery(command.enabled);
      await this.companies.save(loaded.company);
      await this.events.publishTraced(
        new GroupWithoutDeliverySetEvent(named(loaded), command.enabled),
      );
    });
  }
}
