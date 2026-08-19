import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import type { Company } from "../../domain/entities/company.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ChangeCompanyStatusCommand } from "./change-company-status.command.js";

/**
 * Suspend, réactive ou résilie un compte. Le handler ne décide de rien : il
 * charge, délègue la transition à l'**agrégat** — c'est lui qui sait d'où on a
 * le droit de venir — puis persiste. Aucun mur membership : l'auth staff garde
 * la route en amont.
 *
 * Le **motif** exigé par le contrat n'est pas encore relu ailleurs ; il est
 * demandé au moment du geste parce qu'un motif qu'on ne demande pas là ne se
 * retrouve jamais après coup (cf. l'annulation d'un rendez-vous).
 */
@CommandHandler(ChangeCompanyStatusCommand)
export class ChangeCompanyStatusHandler implements ICommandHandler<
  ChangeCompanyStatusCommand,
  void
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: ChangeCompanyStatusCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    apply(company, command.action);
    await this.companies.save(company);
  }
}

/** Une action de fiche vers la méthode d'agrégat qui la porte. */
function apply(company: Company, action: ChangeCompanyStatusCommand["action"]): void {
  if (action === "suspend") {
    // Décision humaine : elle ne se lèvera pas toute seule (cf. SuspensionCause).
    company.suspend("staff");
    return;
  }
  if (action === "reactivate") {
    company.reactivate();
    return;
  }
  company.terminate();
}
