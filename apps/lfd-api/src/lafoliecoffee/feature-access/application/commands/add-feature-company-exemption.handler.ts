import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { CompanyAlreadyExemptedError } from "../../domain/feature-access-errors.js";
import { FeatureCompanyExemptionEvent } from "../../domain/feature-access.events.js";
import { FeatureCompanyExemption } from "../../domain/feature-company-exemption.js";
import { ExemptionCompanyLookup } from "../../domain/ports/exemption-company.lookup.js";
import { FeatureCompanyExemptionRepository } from "../../domain/ports/feature-company-exemption.repository.js";
import { authorOf } from "../feature-access-author.js";
import { AddFeatureCompanyExemptionCommand } from "./add-feature-company-exemption.command.js";

/**
 * Exempte une société. La factory refuse une clé qui ne s'exempte pas par
 * société, une société inconnue ou archivée ; une société déjà exemptée est
 * refusée sans rien écrire ni journaliser.
 */
@CommandHandler(AddFeatureCompanyExemptionCommand)
export class AddFeatureCompanyExemptionHandler implements ICommandHandler<
  AddFeatureCompanyExemptionCommand,
  void
> {
  constructor(
    private readonly exemptions: FeatureCompanyExemptionRepository,
    private readonly companies: ExemptionCompanyLookup,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {CompanyAlreadyExemptedError} la société est déjà dans la liste.
   */
  async execute(command: AddFeatureCompanyExemptionCommand): Promise<void> {
    const exemption = FeatureCompanyExemption.grant({
      key: command.key,
      companyId: command.companyId,
      company: await this.companies.describe(command.companyId),
      at: this.clock.now(),
      author: await authorOf(this.staff, command.staffUserId),
    });
    await this.uow.run(async () => {
      if (!(await this.exemptions.addIfAbsent(exemption))) {
        throw new CompanyAlreadyExemptedError(exemption.key, exemption.companyName);
      }
      await this.events.publishTraced(
        FeatureCompanyExemptionEvent.added(
          exemption.key,
          exemption.companyId,
          exemption.companyName,
        ),
      );
    });
  }
}
