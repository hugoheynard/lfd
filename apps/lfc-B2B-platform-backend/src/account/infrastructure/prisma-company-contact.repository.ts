import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CompanyContactNotFoundError } from "../domain/errors/account-errors.js";
import { CompanyContactRepository } from "../domain/ports/company-contact.repository.js";
import type { ContactDetails } from "../domain/value-objects/contact-details.js";

/** Adaptateur Prisma des contacts additionnels. */
@Injectable()
export class PrismaCompanyContactRepository extends CompanyContactRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async add(companyId: string, details: ContactDetails): Promise<string> {
    const created = await this.prisma.companyContact.create({
      data: { companyId, ...toRow(details) },
      select: { id: true },
    });
    return created.id;
  }

  async update(companyId: string, contactId: string, details: ContactDetails): Promise<void> {
    // `updateMany` avec le mur DANS le `where` (id ET companyId) : une même
    // requête vérifie l'appartenance et écrit. `count === 0` distingue « pas à
    // cette entreprise » d'une écriture faite — un `update` sur l'id seul aurait
    // laissé modifier le contact d'une autre entreprise.
    const { count } = await this.prisma.companyContact.updateMany({
      where: { id: contactId, companyId },
      data: toRow(details),
    });
    if (count === 0) {
      throw new CompanyContactNotFoundError(contactId);
    }
  }

  async remove(companyId: string, contactId: string): Promise<void> {
    const { count } = await this.prisma.companyContact.deleteMany({
      where: { id: contactId, companyId },
    });
    if (count === 0) {
      throw new CompanyContactNotFoundError(contactId);
    }
  }
}

/** Aplati un `ContactDetails` en colonnes. Les VOs garantissent déjà la validité. */
function toRow(details: ContactDetails): {
  prenom: string;
  nom: string;
  fonction: string;
  email: string;
  telephone: string;
} {
  return {
    prenom: details.firstName.value,
    nom: details.lastName.value,
    fonction: details.fonction,
    email: details.email.value,
    telephone: details.phone.value,
  };
}
