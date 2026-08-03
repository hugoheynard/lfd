import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Company } from "../../domain/entities/company.js";
import {
  SiretAlreadyRegisteredError,
  UserProfileNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { UserProfileRepository } from "../../domain/ports/user-profile.repository.js";
import { EmailAddress } from "../../domain/value-objects/email-address.js";
import { PersonName } from "../../domain/value-objects/person-name.js";
import { PhoneNumber } from "../../domain/value-objects/phone-number.js";
import { CreateCompanyCommand } from "./create-company.command.js";

/**
 * Déclare l'entreprise et en fait, d'un même geste, celle de son créateur.
 *
 * Retourne l'**identifiant** et rien d'autre : une commande ne renvoie pas de
 * modèle de lecture, le client relit son compte ensuite (cf. CLAUDE.md §4).
 */
@CommandHandler(CreateCompanyCommand)
export class CreateCompanyHandler implements ICommandHandler<CreateCompanyCommand, string> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly profiles: UserProfileRepository,
  ) {}

  async execute(command: CreateCompanyCommand): Promise<string> {
    const owner = await this.profiles.findById(command.ownerUserId);
    if (owner === null) {
      throw new UserProfileNotFoundError(command.ownerUserId);
    }

    // Le contact de la société = son créateur. Le profil est déjà en base, donc
    // déjà valide ; on le repasse par les value objects parce qu'un enregistrement
    // ancien peut être incomplet (les colonnes de profil sont arrivées avec des
    // défauts vides) — mieux vaut un refus explicite qu'une société au contact vide.
    const company = Company.declare(command, {
      firstName: PersonName.create(owner.firstName, "Prénom du contact"),
      lastName: PersonName.create(owner.lastName, "Nom du contact"),
      // Le contact dérivé d'un profil n'a pas de fonction ; le staff, lui, en
      // fournit une à la création admin (cf. CreateCompanyByStaffHandler).
      fonction: "",
      email: EmailAddress.create(owner.email),
      phone: PhoneNumber.create(owner.phone),
    });

    if (await this.companies.existsBySiret(company.siret.value)) {
      throw new SiretAlreadyRegisteredError(company.siret.value);
    }

    return this.companies.declareOwnedBy(company, command.ownerUserId);
  }
}
