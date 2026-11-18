import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { ChorusRoutingRepository } from "../../domain/ports/chorus-routing.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { StaffDirectory } from "../../domain/ports/staff-directory.js";
import { RecordChorusRoutingCommand } from "./record-chorus-routing.command.js";

/**
 * Pose la fiche Chorus Pro d'une société. C'est la société qui décide si elle
 * peut en avoir une (`Company.recordChorusRouting` refuse une forme non
 * publique) ; la fiche, elle, se range à part, une ligne par société.
 *
 * Reposer le même relevé n'écrit rien : la parole de l'agent qui l'a relevé
 * le premier reste la sienne.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {ChorusRoutingNotPublicError} sa forme juridique n'est pas publique.
 * @throws {InvalidChorusRoutingError} la fiche est mal formée.
 */
@CommandHandler(RecordChorusRoutingCommand)
export class RecordChorusRoutingHandler implements ICommandHandler<
  RecordChorusRoutingCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly routings: ChorusRoutingRepository,
    private readonly staff: StaffDirectory,
  ) {}

  async execute(command: RecordChorusRoutingCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const agent = await this.staff.identify(command.staffUserId);
    const routing = company.recordChorusRouting(command.payload, {
      staffUserId: command.staffUserId,
      name: agent?.name ?? "",
      role: agent?.role ?? "",
    });
    const current = await this.routings.load(command.companyId);
    if (current !== null && current.sameReadingAs(routing)) {
      return;
    }
    await this.routings.save(command.companyId, routing);
  }
}
