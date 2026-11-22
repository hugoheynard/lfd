import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyHasOrdersReader } from "../../../orders/domain/ports/company-has-orders.reader.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyArchivedEvent } from "../../domain/events/company-archive.events.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { CompanyRowLock } from "../../domain/ports/company-row.lock.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { ArchiveCompanyCommand } from "./archive-company.command.js";

/**
 * Supprime (archive) un compte qui n'a jamais commandé. Le handler ne décide
 * de rien : il verrouille la ligne de la société, lit chez les commandes si
 * elle en a, et l'agrégat tranche — déjà supprimé, site, commandes, motif.
 *
 * Le verrou est pris AVANT la lecture des commandes et le chargement, dans la
 * même transaction que l'écriture : un geste concurrent sur la même ligne
 * passe entièrement avant ou après. Aucun mur membership : l'auth staff garde
 * la route en amont.
 */
@CommandHandler(ArchiveCompanyCommand)
export class ArchiveCompanyHandler implements ICommandHandler<ArchiveCompanyCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly lock: CompanyRowLock,
    private readonly orders: CompanyHasOrdersReader,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveCompanyCommand): Promise<void> {
    // Le nom est figé ici, hors transaction : l'annuaire n'a rien à verrouiller.
    const agent = await this.staff.identify(command.staffUserId);
    await this.uow.run(async () => {
      if (!(await this.lock.lock(command.companyId))) {
        throw new CompanyNotFoundError(command.companyId);
      }
      const company = await this.companies.load(command.companyId);
      if (company === null) {
        throw new CompanyNotFoundError(command.companyId);
      }
      company.archive({
        at: this.clock.now(),
        byStaffId: command.staffUserId,
        byName: agent?.name ?? null,
        reason: command.reason,
        hasOrders: await this.orders.hasOrders(command.companyId),
      });
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyArchivedEvent(
          companyNamed(command.companyId, company),
          company.archiveRecord?.reason ?? command.reason,
        ),
      );
    });
  }
}
