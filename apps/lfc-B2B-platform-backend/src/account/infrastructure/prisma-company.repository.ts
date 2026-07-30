import { Injectable } from "@nestjs/common";

import { CompanyStatus, CustomerRole } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import type { Company } from "../domain/entities/company.js";
import { CompanyRepository } from "../domain/ports/company.repository.js";

/** Adaptateur Prisma du port des sociétés. */
@Injectable()
export class PrismaCompanyRepository extends CompanyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async existsBySiret(siret: string): Promise<boolean> {
    const found = await this.prisma.company.findFirst({
      where: { siret },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Société + rattachement du créateur dans **une transaction** : sans elle, un
   * échec entre les deux écritures laisserait une société sans aucun membre —
   * invisible depuis « Mes entreprises », donc impossible à récupérer ou à
   * supprimer par le client.
   */
  async declareOwnedBy(company: Company, ownerUserId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          raisonSociale: company.raisonSociale,
          enseigne: company.enseigne,
          formeJuridique: company.formeJuridique,
          siret: company.siret.value,
          tvaIntracom: company.tvaIntracom,
          contactPrenom: company.contact.firstName.value,
          contactNom: company.contact.lastName.value,
          contactEmail: company.contact.email.value,
          contactTelephone: company.contact.phone.value,
          // Déclarée, pas cliente : l'activation est commerciale.
          status: CompanyStatus.pending,
        },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          userId: ownerUserId,
          companyId: created.id,
          // Le créateur est le gestionnaire de sa société.
          role: CustomerRole.company_admin,
        },
      });

      return created.id;
    });
  }
}
