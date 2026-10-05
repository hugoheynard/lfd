import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Company } from "../../domain/entities/company.js";
import { SubAccountFollows } from "../../domain/entities/sub-account-follows.js";
import { SiretAlreadyRegisteredError } from "../../domain/errors/account-errors.js";
import { PricingFollowNotAllowedError } from "../../domain/errors/hierarchy-errors.js";
import { CompanyDeclaredEvent } from "../../domain/events/company-declared.event.js";
import {
  ParentAttachedEvent,
  ParentFollowedEvent,
} from "../../domain/events/hierarchy-acts.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { AccountHierarchyLock } from "../../domain/ports/account-hierarchy.lock.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyFollowsRepository } from "../../domain/ports/company-follows.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { PricingFollowJournal } from "../../domain/ports/pricing-follow.journal.js";
import { loadCompany, named } from "../services/account-hierarchy-support.js";
import { CreateSubAccountCommand } from "./create-sub-account.command.js";

/**
 * Crée un sous-compte rattaché à son principal, en UNE transaction : la
 * société, son lien, sa première adresse de livraison et ses suivis tombent
 * ensemble ou tiennent ensemble.
 *
 * Sous le verrou de la hiérarchie (§5) : le principal est relu après le
 * verrou, et c'est l'agrégat qui refuse un principal lui-même sous-compte.
 */
@CommandHandler(CreateSubAccountCommand)
export class CreateSubAccountHandler implements ICommandHandler<CreateSubAccountCommand, string> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly addresses: CompanyAddressRepository,
    private readonly follows: CompanyFollowsRepository,
    private readonly lock: AccountHierarchyLock,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly pricingJournal: PricingFollowJournal,
  ) {}

  async execute(command: CreateSubAccountCommand): Promise<string> {
    const aspects = [...new Set(command.payload.follows)];
    if (aspects.includes("pricing") && !command.mayDecidePricing) {
      throw new PricingFollowNotAllowedError();
    }
    const company = Company.declare(command.payload, null);
    const siret = company.siret;
    if (siret !== null && (await this.companies.existsBySiret(siret.value))) {
      throw new SiretAlreadyRegisteredError(siret.value);
    }
    const now = this.clock.now();

    const companyId = await this.uow.run(async () => {
      await this.lock.acquire();
      const parent = await loadCompany(this.companies, command.parentId);
      company.attachTo(parent.company);
      const id = await this.companies.declareUnowned(company);

      const book = await this.addresses.loadDeliveryBook(id);
      book.add(this.ids.next(), command.payload.deliveryAddress, now);
      await this.addresses.saveDeliveryBook(book);

      const follows = SubAccountFollows.none(id);
      for (const aspect of aspects) {
        follows.follow(aspect, company, parent.company, now);
      }
      await this.follows.save(follows);

      const child = companyNamed(id, company);
      await this.events.publishTraced(new ParentAttachedEvent(child, named(parent), "created"));
      for (const aspect of aspects) {
        // `pricing` va au journal des prix (S3) ; les autres au journal général.
        await (aspect === "pricing"
          ? this.pricingJournal.followStarted({ child, parent: named(parent), validFrom: now })
          : this.events.publishTraced(new ParentFollowedEvent(child, named(parent), aspect, now)));
      }
      return id;
    });
    // Le fait d'entonnoir, best-effort comme à toute création staff.
    this.events.publish(new CompanyDeclaredEvent(companyId, company.displayName(), "staff", null));
    return companyId;
  }
}
