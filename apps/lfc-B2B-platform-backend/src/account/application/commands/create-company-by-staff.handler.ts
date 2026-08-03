import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Company } from "../../domain/entities/company.js";
import { SiretAlreadyRegisteredError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CreateCompanyByStaffCommand } from "./create-company-by-staff.command.js";

/**
 * Crée le **dossier société** d'un compte client depuis l'admin — **sans
 * propriétaire** : le rattachement d'un client se fera par invitation, plus tard
 * (flux séparé). Retourne le seul identifiant ; une commande ne renvoie pas de
 * modèle de lecture (cf. CLAUDE.md §4), le front relit la fiche ensuite.
 */
@CommandHandler(CreateCompanyByStaffCommand)
export class CreateCompanyByStaffHandler implements ICommandHandler<
  CreateCompanyByStaffCommand,
  string
> {
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: CreateCompanyByStaffCommand): Promise<string> {
    // Contact saisi par le staff : on le fait passer par le value object, qui en
    // tient les règles (prénom/nom présents, e-mail valide, fonction bornée). Un
    // `ContactDetails` est structurellement un `CompanyContact` (mêmes champs).
    const company = Company.declare(command, ContactDetails.create(command.contact));

    if (await this.companies.existsBySiret(company.siret.value)) {
      throw new SiretAlreadyRegisteredError(company.siret.value);
    }

    return this.companies.declareUnowned(company);
  }
}
