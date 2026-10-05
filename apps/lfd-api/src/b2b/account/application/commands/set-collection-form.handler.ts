import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CollectionFormSetEvent } from "../../domain/events/hierarchy-acts.event.js";
import { Clock } from "../../../../platform/time/clock.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CollectionFormRepository } from "../../domain/ports/collection-form.repository.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { SetCollectionFormCommand } from "./set-collection-form.command.js";

/**
 * Pose la forme de prélèvement d'un site (`plan-sous-comptes.md` §2.1 ter) :
 * ferme la période en cours, ouvre la nouvelle à l'instant du geste.
 *
 * Sous le verrou de la hiérarchie, comme les suivis : « ce site suit-il
 * `billing` ? » se lit dans la même transaction que l'écriture, et un
 * détachement concurrent ne peut pas passer entre les deux. Idempotent :
 * reposer la forme en vigueur n'écrit rien et ne s'inscrit pas.
 *
 * Journalisé (`company.collection_form_set`) dans la même transaction : c'est
 * une décision d'argent — elle choisit le compte prélevé.
 */
@CommandHandler(SetCollectionFormCommand)
export class SetCollectionFormHandler implements ICommandHandler<SetCollectionFormCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly forms: CollectionFormRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: SetCollectionFormCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.lock.acquire();
      const site = await loadCompany(this.companies, command.companyId);
      const now = this.clock.now();
      const follows = await this.follows.load(site.id);
      const history = await this.forms.load(site.id);
      if (!history.choose(command.form, now, follows.followsAt("billing", now) !== null)) {
        return;
      }
      await this.forms.save(history);
      await this.events.publishTraced(new CollectionFormSetEvent(named(site), command.form, now));
    });
  }
}
